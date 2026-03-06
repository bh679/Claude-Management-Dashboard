const express = require('express');
const { execSync, execFileSync } = require('child_process');
const router = express.Router();

const COO_REPO = 'bh679/coo-agent';

function fetchCooFile(filePath) {
  try {
    const raw = execSync(
      `gh api repos/${COO_REPO}/contents/${filePath}`,
      { encoding: 'utf8', timeout: 15000 }
    );
    const data = JSON.parse(raw);
    const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    return { content, sha: data.sha };
  } catch (err) {
    if (err.message && err.message.includes('Not Found')) {
      return { content: null, sha: null };
    }
    throw err;
  }
}

function putCooFile(filePath, newContent, sha, commitMessage) {
  const encoded = Buffer.from(JSON.stringify(newContent, null, 2) + '\n').toString('base64');
  const ghArgs = [
    'api', `repos/${COO_REPO}/contents/${filePath}`,
    '-X', 'PUT',
    '-f', `message=${commitMessage}`,
    '-f', `content=${encoded}`
  ];
  if (sha) {
    ghArgs.push('-f', `sha=${sha}`);
  }
  execFileSync('gh', ghArgs, { encoding: 'utf8', timeout: 15000 });
}

function validateRepo(repo) {
  return typeof repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(repo);
}

// GET / — Fetch pending repos
router.get('/', (req, res) => {
  try {
    const { content } = fetchCooFile('pending-repos.json');
    res.json(content || []);
  } catch (err) {
    console.error('Failed to fetch pending repos:', err.message);
    res.status(500).json({ error: 'Failed to fetch pending repos', message: err.message });
  }
});

// POST /approve — Move pending repo to consumers.json
router.post('/approve', (req, res) => {
  const { repo, description } = req.body;

  if (!validateRepo(repo)) {
    return res.status(400).json({ error: 'invalid_repo', message: 'Invalid repo format' });
  }
  if (!description || typeof description !== 'string') {
    return res.status(400).json({ error: 'missing_description', message: 'Description is required' });
  }

  try {
    const pending = fetchCooFile('pending-repos.json');
    const consumers = fetchCooFile('consumers.json');

    if (!pending.content || !Array.isArray(pending.content)) {
      return res.status(400).json({ error: 'no_pending', message: 'No pending repos found' });
    }

    const inPending = pending.content.some(p => p.repo === repo);
    if (!inPending) {
      return res.status(400).json({ error: 'not_pending', message: `${repo} is not in pending repos` });
    }

    const consumersArray = Array.isArray(consumers.content) ? consumers.content : [];
    const alreadyTracked = consumersArray.some(c => c.repo === repo);
    if (alreadyTracked) {
      return res.status(400).json({ error: 'already_tracked', message: `${repo} is already tracked` });
    }

    // Build new arrays (immutable)
    const newConsumers = [...consumersArray, { repo, description }];
    const newPending = pending.content.filter(p => p.repo !== repo);

    putCooFile('consumers.json', newConsumers, consumers.sha, `chore: approve ${repo} as tracked project`);
    putCooFile('pending-repos.json', newPending, pending.sha, `chore: remove ${repo} from pending`);

    res.json({ success: true, repo });
  } catch (err) {
    console.error('Failed to approve repo:', err.message);
    if (err.message && err.message.includes('409')) {
      return res.status(409).json({ error: 'conflict', message: 'File was modified. Please refresh and try again.' });
    }
    res.status(500).json({ error: 'approve_failed', message: err.message });
  }
});

// POST /reject — Move pending repo to untracked-repos.json
router.post('/reject', (req, res) => {
  const { repo, description, reason, replacedBy } = req.body;

  if (!validateRepo(repo)) {
    return res.status(400).json({ error: 'invalid_repo', message: 'Invalid repo format' });
  }
  if (replacedBy && !validateRepo(replacedBy)) {
    return res.status(400).json({ error: 'invalid_replaced_by', message: 'Invalid replacedBy repo format' });
  }

  try {
    const pending = fetchCooFile('pending-repos.json');

    if (!pending.content || !Array.isArray(pending.content)) {
      return res.status(400).json({ error: 'no_pending', message: 'No pending repos found' });
    }

    const inPending = pending.content.some(p => p.repo === repo);
    if (!inPending) {
      return res.status(400).json({ error: 'not_pending', message: `${repo} is not in pending repos` });
    }

    const untracked = fetchCooFile('untracked-repos.json');
    const untrackedArray = Array.isArray(untracked.content) ? untracked.content : [];

    const entry = {
      repo,
      description: description || '',
      rejected_at: new Date().toISOString()
    };
    if (reason) entry.reason = reason;
    if (replacedBy) entry.replacedBy = replacedBy;

    const newUntracked = [...untrackedArray, entry];
    const newPending = pending.content.filter(p => p.repo !== repo);

    putCooFile('untracked-repos.json', newUntracked, untracked.sha, `chore: reject ${repo} — moved to untracked`);
    putCooFile('pending-repos.json', newPending, pending.sha, `chore: remove ${repo} from pending`);

    res.json({ success: true, repo });
  } catch (err) {
    console.error('Failed to reject repo:', err.message);
    if (err.message && err.message.includes('409')) {
      return res.status(409).json({ error: 'conflict', message: 'File was modified. Please refresh and try again.' });
    }
    res.status(500).json({ error: 'reject_failed', message: err.message });
  }
});

// POST /add-sub-project — Approve pending repo as sub-project of an existing tracked project
router.post('/add-sub-project', (req, res) => {
  const { repo, description, parent } = req.body;

  if (!validateRepo(repo)) {
    return res.status(400).json({ error: 'invalid_repo', message: 'Invalid repo format' });
  }
  if (!parent || !validateRepo(parent)) {
    return res.status(400).json({ error: 'invalid_parent', message: 'A valid parent repo is required' });
  }
  if (!description || typeof description !== 'string') {
    return res.status(400).json({ error: 'missing_description', message: 'Description is required' });
  }

  try {
    const pending = fetchCooFile('pending-repos.json');
    const consumers = fetchCooFile('consumers.json');

    if (!pending.content || !Array.isArray(pending.content)) {
      return res.status(400).json({ error: 'no_pending', message: 'No pending repos found' });
    }

    const inPending = pending.content.some(p => p.repo === repo);
    if (!inPending) {
      return res.status(400).json({ error: 'not_pending', message: `${repo} is not in pending repos` });
    }

    const consumersArray = Array.isArray(consumers.content) ? consumers.content : [];

    const alreadyTracked = consumersArray.some(c => c.repo === repo);
    if (alreadyTracked) {
      return res.status(400).json({ error: 'already_tracked', message: `${repo} is already tracked` });
    }

    const parentExists = consumersArray.some(c => c.repo === parent);
    if (!parentExists) {
      return res.status(400).json({ error: 'parent_not_found', message: `Parent project ${parent} is not a tracked project` });
    }

    // Build new arrays (immutable)
    const newConsumers = [...consumersArray, { repo, description, parent }];
    const newPending = pending.content.filter(p => p.repo !== repo);

    putCooFile('consumers.json', newConsumers, consumers.sha, `chore: add ${repo} as sub-project of ${parent}`);
    putCooFile('pending-repos.json', newPending, pending.sha, `chore: remove ${repo} from pending`);

    res.json({ success: true, repo, parent });
  } catch (err) {
    console.error('Failed to add sub-project:', err.message);
    if (err.message && err.message.includes('409')) {
      return res.status(409).json({ error: 'conflict', message: 'File was modified. Please refresh and try again.' });
    }
    res.status(500).json({ error: 'sub_project_failed', message: err.message });
  }
});

module.exports = router;
