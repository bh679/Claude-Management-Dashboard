const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const SUPPORTED_SCHEMA_VERSION = '1.0';
const BOARDS_PATH = path.join(__dirname, '..', '..', 'public', 'data', 'project-boards.json');

function fetchGhContent(repoPath) {
  const raw = execSync(
    `gh api repos/bh679/coo-agent/contents/${repoPath}`,
    { encoding: 'utf8', timeout: 15000 }
  );
  const data = JSON.parse(raw);
  return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
}

function fetchParticipation(repo) {
  try {
    const raw = execSync(
      `gh api repos/${repo}/stats/participation`,
      { encoding: 'utf8', timeout: 10000 }
    );
    const data = JSON.parse(raw);
    // Return last 4 weeks of commit counts
    return (data.all || []).slice(-4);
  } catch {
    return [0, 0, 0, 0];
  }
}

function loadBoards() {
  try {
    return JSON.parse(fs.readFileSync(BOARDS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function sumMetrics(metricsList) {
  const combined = {
    open_prs: 0,
    open_issues: 0,
    commits_7d: 0,
    merged_prs_7d: 0,
    days_since_last_commit: Infinity
  };
  for (const m of metricsList) {
    combined.open_prs += m.open_prs || 0;
    combined.open_issues += m.open_issues || 0;
    combined.commits_7d += m.commits_7d || 0;
    combined.merged_prs_7d += m.merged_prs_7d || 0;
    if (m.days_since_last_commit < combined.days_since_last_commit) {
      combined.days_since_last_commit = m.days_since_last_commit;
    }
  }
  if (!isFinite(combined.days_since_last_commit)) {
    combined.days_since_last_commit = null;
  }
  return combined;
}

function groupProjects(dashboard, consumers, boards) {
  const projectsByRepo = {};
  for (const p of dashboard.projects) {
    projectsByRepo[p.repo] = p;
  }

  // Build parent-child map from consumers.json
  const parentChildMap = {};
  const childSet = new Set();
  const standaloneSet = new Set();

  for (const c of consumers) {
    if (c.parent) {
      if (!parentChildMap[c.parent]) {
        parentChildMap[c.parent] = [];
      }
      parentChildMap[c.parent].push(c.repo);
      childSet.add(c.repo);
      if (c.standalone) {
        standaloneSet.add(c.repo);
      }
    }
  }

  // Fetch participation stats for all repos in dashboard
  const allRepos = dashboard.projects.map(p => p.repo);
  const activityMap = {};
  for (const repo of allRepos) {
    activityMap[repo] = fetchParticipation(repo);
  }

  const grouped = [];

  for (const p of dashboard.projects) {
    // Skip children (they'll be nested under parent) unless standalone
    if (childSet.has(p.repo) && !standaloneSet.has(p.repo)) {
      continue;
    }

    // If this is a standalone child, render it as a solo card (no children)
    if (childSet.has(p.repo) && standaloneSet.has(p.repo)) {
      grouped.push({
        ...p,
        activity: activityMap[p.repo] || [0, 0, 0, 0],
        board_url: boards[p.repo] || null,
        children: [],
        combined_metrics: p.metrics
      });
      continue;
    }

    // This is a top-level project — gather children
    const childRepos = parentChildMap[p.repo] || [];
    const children = childRepos.map(repo => {
      const childProject = projectsByRepo[repo];
      if (childProject) {
        return {
          ...childProject,
          activity: activityMap[repo] || [0, 0, 0, 0],
          board_url: boards[repo] || null
        };
      }
      // Child is in consumers.json but not in dashboard.json
      const consumer = consumers.find(c => c.repo === repo);
      return {
        repo,
        name: repo.split('/')[1],
        description: consumer ? consumer.description : '',
        status: 'unknown',
        status_label: 'No Data',
        metrics: { open_prs: 0, open_issues: 0, commits_7d: 0, merged_prs_7d: 0, days_since_last_commit: null },
        activity: [0, 0, 0, 0],
        board_url: boards[repo] || null,
        risks: [],
        blockages: [],
        recent_updates: []
      };
    });

    const allMetrics = [p.metrics, ...children.map(c => c.metrics)];

    grouped.push({
      ...p,
      activity: activityMap[p.repo] || [0, 0, 0, 0],
      board_url: boards[p.repo] || null,
      children,
      combined_metrics: sumMetrics(allMetrics)
    });
  }

  return grouped;
}

router.get('/', (req, res) => {
  try {
    const dashboard = fetchGhContent('dashboard.json');

    const schemaVersion = dashboard.schemaVersion;
    if (!schemaVersion || schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      return res.status(422).json({
        error: 'schema_incompatible',
        message: `Dashboard schema version "${schemaVersion || 'missing'}" is not compatible. Expected "${SUPPORTED_SCHEMA_VERSION}".`,
        schemaVersion: schemaVersion || null,
        supportedVersion: SUPPORTED_SCHEMA_VERSION
      });
    }

    let consumers;
    try {
      consumers = fetchGhContent('consumers.json');
    } catch {
      consumers = [];
    }

    const boards = loadBoards();
    const grouped = groupProjects(dashboard, consumers, boards);

    res.json({
      ...dashboard,
      projects: grouped
    });
  } catch (err) {
    console.error('Failed to fetch projects:', err.message);
    res.status(500).json({ error: 'Failed to fetch projects', message: err.message });
  }
});

module.exports = router;
