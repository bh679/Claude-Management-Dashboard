const WIKI_RAW_BASE = 'https://raw.githubusercontent.com/wiki/bh679/weekly-blog';

function parseIndex(markdown) {
  const posts = [];
  const entryRegex = /^## \[(.+?)\]\(.*?Blog:-(.+?)\)\n(.+)\n(.+)/gm;
  let match;
  while ((match = entryRegex.exec(markdown)) !== null) {
    posts.push({
      title: match[1],
      slug: match[2],
      date: match[3].trim(),
      abstract: match[4].trim()
    });
  }
  return posts;
}

async function loadBlogData() {
  const loading = document.getElementById('blog-loading');
  const error = document.getElementById('blog-error');
  const list = document.getElementById('blog-list');
  const detail = document.getElementById('blog-detail');

  loading.classList.remove('hidden');
  error.classList.add('hidden');
  list.classList.add('hidden');
  detail.classList.add('hidden');

  try {
    const res = await fetch(WIKI_RAW_BASE + '/Home.md');
    if (!res.ok) throw new Error('Failed to fetch blog index');
    const markdown = await res.text();
    const posts = parseIndex(markdown);

    loading.classList.add('hidden');

    if (!posts.length) {
      error.textContent = 'No blog posts yet.';
      error.classList.remove('hidden');
      return;
    }

    list.innerHTML = posts.map(p => `
      <div class="blog-card" data-slug="${esc(p.slug)}">
        <div class="blog-card-header">
          <h3 class="blog-card-title">${esc(p.title)}</h3>
          <span class="blog-card-date">${esc(p.date)}</span>
        </div>
        <p class="blog-card-abstract">${esc(p.abstract)}</p>
      </div>
    `).join('');

    list.classList.remove('hidden');

    list.querySelectorAll('.blog-card').forEach(card => {
      card.addEventListener('click', () => openPost(card.dataset.slug));
    });
  } catch (err) {
    loading.classList.add('hidden');
    error.textContent = 'Failed to load blog posts: ' + err.message;
    error.classList.remove('hidden');
  }
}

async function openPost(slug) {
  const list = document.getElementById('blog-list');
  const detail = document.getElementById('blog-detail');
  const detailBody = document.getElementById('blog-detail-body');

  list.classList.add('hidden');
  detail.classList.remove('hidden');
  detailBody.innerHTML = '<p class="loading">Loading post...</p>';

  try {
    const res = await fetch(WIKI_RAW_BASE + '/Blog:-' + encodeURIComponent(slug) + '.md');
    if (!res.ok) throw new Error('Post not found');
    const markdown = await res.text();
    detailBody.innerHTML = marked.parse(markdown);
  } catch (err) {
    detailBody.innerHTML = '<p class="error-state">Failed to load post: ' + esc(err.message) + '</p>';
  }
}

function closeBlogPost() {
  document.getElementById('blog-detail').classList.add('hidden');
  document.getElementById('blog-list').classList.remove('hidden');
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
