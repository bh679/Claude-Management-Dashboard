const express = require('express');
const { execSync } = require('child_process');
const router = express.Router();

const SUPPORTED_SCHEMA_VERSION = '1.0';

router.get('/', (req, res) => {
  try {
    const contentJson = execSync(
      'gh api repos/bh679/coo-agent/contents/dashboard.json',
      { encoding: 'utf8', timeout: 15000 }
    );
    const contentData = JSON.parse(contentJson);
    const dashboard = JSON.parse(Buffer.from(contentData.content, 'base64').toString('utf8'));

    const schemaVersion = dashboard.schemaVersion;
    if (!schemaVersion || schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      return res.status(422).json({
        error: 'schema_incompatible',
        message: `Dashboard schema version "${schemaVersion || 'missing'}" is not compatible. Expected "${SUPPORTED_SCHEMA_VERSION}".`,
        schemaVersion: schemaVersion || null,
        supportedVersion: SUPPORTED_SCHEMA_VERSION
      });
    }

    res.json(dashboard);
  } catch (err) {
    console.error('Failed to fetch projects:', err.message);
    res.status(500).json({ error: 'Failed to fetch projects', message: err.message });
  }
});

module.exports = router;
