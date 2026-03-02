const express = require('express');
const http = require('http');
const router = express.Router();

const ANALYTICS_PORT = process.env.ANALYTICS_PORT || 8081;
const ANALYTICS_HOST = process.env.ANALYTICS_HOST || 'localhost';

function proxyRequest(req, res) {
  const options = {
    hostname: ANALYTICS_HOST,
    port: ANALYTICS_PORT,
    path: '/api/scrape' + (req.url === '/' ? '' : req.url),
    method: req.method,
    headers: { ...req.headers, host: `${ANALYTICS_HOST}:${ANALYTICS_PORT}` }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    res.status(502).json({
      error: 'Analytics service unavailable',
      message: `Cannot reach analytics server at port ${ANALYTICS_PORT}. Is it running?`
    });
  });

  if (req.method === 'POST' || req.method === 'PUT') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

router.all('/*', proxyRequest);

module.exports = router;
