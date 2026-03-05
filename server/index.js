const express = require('express');
const cors = require('cors');
const path = require('path');
const proxyRoutes = require('./routes/proxy');
const reportsRoutes = require('./routes/reports');
const projectsRoutes = require('./routes/projects');
const ideasRoutes = require('./routes/ideas');
const blogRoutes = require('./routes/blog');
const deploymentsRoutes = require('./routes/deployments');

const pkg = require('../package.json');

const PORT = process.env.PORT || 8080;

const app = express();

app.use(cors());
app.use(express.json());

// Serve static dashboard files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Version endpoint
app.get('/api/version', (_req, res) => res.json({ version: pkg.version }));

// API routes
app.use('/api/cmd/scrape', proxyRoutes);
app.use('/api/cmd/reports', reportsRoutes);
app.use('/api/cmd/projects', projectsRoutes);
app.use('/api/cmd/ideas', ideasRoutes);
app.use('/api/cmd/blog', blogRoutes);
app.use('/api/cmd/deployments', deploymentsRoutes);

app.listen(PORT, () => {
  console.log(`Claude Management Dashboard running on http://localhost:${PORT}`);
});
