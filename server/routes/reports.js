const express = require('express');
const { execSync } = require('child_process');
const router = express.Router();

router.get('/latest', (req, res) => {
  try {
    // List report files from the coo-agent repo
    const filesJson = execSync(
      'gh api repos/bh679/coo-agent/contents/reports --jq \'[.[] | select(.name != ".gitkeep")]\'',
      { encoding: 'utf8', timeout: 15000 }
    );
    const files = JSON.parse(filesJson);

    if (files.length === 0) {
      return res.json({ report: null, message: 'No reports available' });
    }

    // Sort by name descending (YYYY-MM-DD format sorts chronologically)
    files.sort((a, b) => b.name.localeCompare(a.name));
    const latest = files[0];

    // Fetch the content of the latest report
    const contentJson = execSync(
      `gh api repos/bh679/coo-agent/contents/reports/${latest.name}`,
      { encoding: 'utf8', timeout: 15000 }
    );
    const contentData = JSON.parse(contentJson);
    const markdown = Buffer.from(contentData.content, 'base64').toString('utf8');

    res.json({
      filename: latest.name,
      date: latest.name.replace('.md', ''),
      markdown
    });
  } catch (err) {
    console.error('Failed to fetch report:', err.message);
    res.status(500).json({ error: 'Failed to fetch report', message: err.message });
  }
});

router.get('/list', (req, res) => {
  try {
    const filesJson = execSync(
      'gh api repos/bh679/coo-agent/contents/reports --jq \'[.[] | select(.name != ".gitkeep") | {name, date: (.name | rtrimstr(".md"))}]\'',
      { encoding: 'utf8', timeout: 15000 }
    );
    const files = JSON.parse(filesJson);
    files.sort((a, b) => b.name.localeCompare(a.name));
    res.json(files);
  } catch (err) {
    console.error('Failed to list reports:', err.message);
    res.status(500).json({ error: 'Failed to list reports', message: err.message });
  }
});

module.exports = router;
