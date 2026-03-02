const express = require('express');
const { execSync } = require('child_process');
const router = express.Router();

router.get('/', (req, res) => {
  try {
    const itemsJson = execSync(
      'gh project item-list 5 --owner bh679 --format json',
      { encoding: 'utf8', timeout: 15000 }
    );
    const data = JSON.parse(itemsJson);
    res.json(data.items || []);
  } catch (err) {
    console.error('Failed to fetch ideas:', err.message);
    res.status(500).json({ error: 'Failed to fetch ideas', message: err.message });
  }
});

module.exports = router;
