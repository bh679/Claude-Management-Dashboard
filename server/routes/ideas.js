const express = require('express');
const { execSync } = require('child_process');
const router = express.Router();

const REPO = 'bh679/Ideas';
const CATEGORIES = [
  { key: 'opportunities', dir: 'data/opportunities' },
  { key: 'projects', dir: 'data/drafts' },
  { key: 'features', dir: 'data/issues' }
];

function fetchJsonFiles(dir) {
  try {
    const listing = execSync(
      `gh api repos/${REPO}/contents/${dir} --jq '[.[] | select(.name | endswith(".json"))]'`,
      { encoding: 'utf8', timeout: 15000 }
    );
    const files = JSON.parse(listing);

    return files.map(file => {
      try {
        const content = execSync(
          `gh api repos/${REPO}/contents/${dir}/${file.name} --jq '.content'`,
          { encoding: 'utf8', timeout: 10000 }
        );
        const decoded = Buffer.from(content.trim(), 'base64').toString('utf8');
        return JSON.parse(decoded);
      } catch (err) {
        console.error(`Failed to fetch ${dir}/${file.name}:`, err.message);
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    console.error(`Failed to list ${dir}:`, err.message);
    return [];
  }
}

router.get('/', (req, res) => {
  try {
    const result = {};
    for (const { key, dir } of CATEGORIES) {
      result[key] = fetchJsonFiles(dir);
    }
    res.json(result);
  } catch (err) {
    console.error('Failed to fetch ideas:', err.message);
    res.status(500).json({ error: 'Failed to fetch ideas', message: err.message });
  }
});

module.exports = router;
