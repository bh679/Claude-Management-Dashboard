const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DEPLOYMENTS_PATH = path.join(__dirname, '..', '..', 'public', 'data', 'deployments.json');
const HEALTH_CHECK_TIMEOUT = 5000;

function loadDeploymentsConfig() {
  const raw = fs.readFileSync(DEPLOYMENTS_PATH, 'utf8');
  return JSON.parse(raw);
}

async function checkHealth(url) {
  if (!url) {
    return { status: 'not_deployed', responseTime: null };
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    let res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow'
    });

    // Some servers don't support HEAD — fall back to GET
    if (res.status === 404 || res.status === 405) {
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), HEALTH_CHECK_TIMEOUT);
      res = await fetch(url, {
        method: 'GET',
        signal: controller2.signal,
        redirect: 'follow'
      });
      clearTimeout(timeout2);
    }

    clearTimeout(timeout);
    const responseTime = Date.now() - start;

    if (res.ok || (res.status >= 300 && res.status < 400)) {
      return { status: 'live', responseTime, statusCode: res.status };
    }
    return { status: 'error', responseTime, statusCode: res.status };
  } catch (err) {
    const responseTime = Date.now() - start;
    return { status: 'offline', responseTime, error: err.message };
  }
}

// GET /api/deployments
router.get('/', async (req, res) => {
  try {
    const config = loadDeploymentsConfig();
    const repos = Object.keys(config);

    const healthResults = await Promise.all(
      repos.map(repo => checkHealth(config[repo].url))
    );

    const result = {};
    repos.forEach((repo, i) => {
      result[repo] = {
        ...config[repo],
        status: healthResults[i].status,
        responseTime: healthResults[i].responseTime,
        statusCode: healthResults[i].statusCode || null
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Deployments health check failed:', err.message);
    res.status(500).json({ error: 'Failed to check deployment status' });
  }
});

module.exports = router;
