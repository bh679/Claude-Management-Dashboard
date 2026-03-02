const express = require('express');
const cors = require('cors');
const path = require('path');
const proxyRoutes = require('./routes/proxy');
const reportsRoutes = require('./routes/reports');
const ideasRoutes = require('./routes/ideas');

const PORT = process.env.PORT || 8080;

const app = express();

app.use(cors());
app.use(express.json());

// Serve static dashboard files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/scrape', proxyRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/ideas', ideasRoutes);

app.listen(PORT, () => {
  console.log(`Claude Management Dashboard running on http://localhost:${PORT}`);
});
