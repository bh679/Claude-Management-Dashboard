const express = require('express');
const { execSync } = require('child_process');
const router = express.Router();

router.get('/', (req, res) => {
  try {
    const contentJson = execSync(
      'gh api repos/bh679/coo-agent/contents/dashboard.json',
      { encoding: 'utf8', timeout: 15000 }
    );
    const contentData = JSON.parse(contentJson);
    const dashboard = JSON.parse(Buffer.from(contentData.content, 'base64').toString('utf8'));
    res.json(dashboard);
  } catch (err) {
    console.error('Failed to fetch projects:', err.message);
    res.status(500).json({ error: 'Failed to fetch projects', message: err.message });
  }
});

module.exports = router;
