const express = require('express');
const { execSync } = require('child_process');
const router = express.Router();

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function fetchGhFileContent(repoPath) {
  const raw = execSync(
    `gh api repos/bh679/coo-agent/contents/${repoPath}`,
    { encoding: 'utf8', timeout: 15000 }
  );
  const data = JSON.parse(raw);
  return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
}

function getRepoList() {
  const dashboard = fetchGhFileContent('dashboard.json');
  const topLevel = dashboard.projects.map(p => p.repo);

  let childRepos = [];
  try {
    const consumers = fetchGhFileContent('consumers.json');
    childRepos = consumers.map(c => c.repo).filter(r => !topLevel.includes(r));
  } catch {
    // consumers.json may not exist
  }

  return [...topLevel, ...childRepos];
}

function buildGraphQLQuery(repos) {
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();

  const repoFragments = repos.map((repo, i) => {
    const [owner, name] = repo.split('/');
    return `
    repo${i}: repository(owner: "${owner}", name: "${name}") {
      issues(states: OPEN) { totalCount }
      projectsV2(first: 5) {
        nodes {
          title
          number
          url
          items(first: 100) {
            totalCount
            nodes {
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
            }
          }
        }
      }
      defaultBranchRef {
        target {
          ... on Commit {
            history(since: "${since}", first: 100) {
              totalCount
              nodes { committedDate }
            }
          }
        }
      }
    }`;
  });

  return `query { ${repoFragments.join('\n')} }`;
}

function buildDailyCommits(commitNodes) {
  const counts = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Initialize 120 days (~4 months) with zero counts
  for (let i = 119; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    counts[key] = 0;
  }

  // Count commits per day
  for (const node of commitNodes) {
    const key = node.committedDate.slice(0, 10);
    if (key in counts) {
      counts[key]++;
    }
  }

  return Object.entries(counts).map(([date, count]) => ({ date, count }));
}

function countOpenItems(boardNodes) {
  const closedStatuses = ['done', 'closed', 'complete', 'completed'];

  return boardNodes.map(board => {
    let openItems = 0;
    for (const item of board.items.nodes) {
      const statusField = item.fieldValueByName;
      const statusName = statusField ? statusField.name : null;
      if (!statusName || !closedStatuses.includes(statusName.toLowerCase())) {
        openItems++;
      }
    }

    return {
      title: board.title,
      number: board.number,
      url: board.url,
      totalItems: board.items.totalCount,
      openItems
    };
  });
}

function parseResponse(data, repos) {
  const result = {};

  repos.forEach((repo, i) => {
    const repoData = data[`repo${i}`];
    if (!repoData) {
      result[repo] = { openIssues: 0, dailyCommits: [], projectBoards: [] };
      return;
    }

    const history = repoData.defaultBranchRef
      ? repoData.defaultBranchRef.target.history
      : null;

    result[repo] = {
      openIssues: repoData.issues.totalCount,
      dailyCommits: history ? buildDailyCommits(history.nodes) : buildDailyCommits([]),
      projectBoards: countOpenItems(repoData.projectsV2.nodes)
    };
  });

  return result;
}

router.get('/', (req, res) => {
  // Return cached data if fresh
  if (cache.data && (Date.now() - cache.timestamp < CACHE_TTL)) {
    return res.json(cache.data);
  }

  try {
    const repos = getRepoList();
    const query = buildGraphQLQuery(repos);

    const rawResult = execSync(
      `gh api graphql -f query='${query.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf8', timeout: 30000 }
    );
    const parsed = JSON.parse(rawResult);

    if (parsed.errors) {
      console.error('GraphQL errors:', parsed.errors);
    }

    const result = parseResponse(parsed.data || {}, repos);

    cache = { data: result, timestamp: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('Failed to fetch repo stats:', err.message);

    // Serve stale cache if available
    if (cache.data) {
      return res.json({ ...cache.data, _stale: true });
    }

    res.status(500).json({ error: 'Failed to fetch repo stats', message: err.message });
  }
});

module.exports = router;
