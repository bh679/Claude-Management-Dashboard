const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const WIKI_DIR = '/tmp/weekly-blog-wiki';
const WIKI_REPO = 'https://github.com/bh679/weekly-blog.wiki.git';

function syncWiki() {
  try {
    if (fs.existsSync(path.join(WIKI_DIR, '.git'))) {
      execSync(`git -C ${WIKI_DIR} pull --quiet`, { timeout: 15000 });
    } else {
      execSync(`git clone --depth 1 ${WIKI_REPO} ${WIKI_DIR}`, { timeout: 30000 });
    }
  } catch (err) {
    console.error('Wiki sync failed:', err.message);
    // Continue with stale data if available
    if (!fs.existsSync(WIKI_DIR)) {
      throw new Error('Wiki not available');
    }
  }
}

function parseIndex() {
  const homePath = path.join(WIKI_DIR, 'Home.md');
  const content = fs.readFileSync(homePath, 'utf8');

  const posts = [];
  // Match: ## [Title](/bh679/weekly-blog/wiki/Blog:-Slug)
  // Followed by: date line
  // Followed by: abstract line
  const entryRegex = /^## \[(.+?)\]\(.*?Blog:-(.+?)\)\n(.+)\n(.+)/gm;
  let match;
  while ((match = entryRegex.exec(content)) !== null) {
    posts.push({
      title: match[1],
      slug: match[2],
      date: match[3].trim(),
      abstract: match[4].trim()
    });
  }
  return posts;
}

router.get('/posts', (req, res) => {
  try {
    syncWiki();
    const posts = parseIndex();
    res.json(posts);
  } catch (err) {
    console.error('Failed to fetch blog posts:', err.message);
    res.status(500).json({ error: 'Failed to fetch blog posts', message: err.message });
  }
});

router.get('/post/:slug', (req, res) => {
  try {
    syncWiki();
    const filename = `Blog:-${req.params.slug}.md`;
    const filePath = path.join(WIKI_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const markdown = fs.readFileSync(filePath, 'utf8');
    res.json({ slug: req.params.slug, markdown });
  } catch (err) {
    console.error('Failed to fetch blog post:', err.message);
    res.status(500).json({ error: 'Failed to fetch blog post', message: err.message });
  }
});

module.exports = router;
