const WIKI_RAW_BASE = 'https://raw.githubusercontent.com/wiki/bh679/weekly-blog';

let _blogCountdownInterval = null;
let _allRunCards = [];
let _runsExpanded = false;

async function loadBlogData() {
  const loading = document.getElementById('blog-loading');
  const error = document.getElementById('blog-error');
  const content = document.getElementById('blog-content');

  loading.classList.remove('hidden');
  error.classList.add('hidden');
  content.classList.add('hidden');

  try {
    const res = await fetch('/api/cmd/blog/runs');
    const data = await res.json();

    loading.classList.add('hidden');

    renderSchedule(data.schedule);
    renderRunHistory(data.runs);

    content.classList.remove('hidden');

    // Load blog posts independently (don't block the schedule/runs)
    loadBlogPosts();
  } catch (err) {
    loading.classList.add('hidden');
    error.textContent = 'Failed to load blog data: ' + err.message;
    error.classList.remove('hidden');
  }
}

// --- Schedule ---

function renderSchedule(schedule) {
  const nextDate = new Date(schedule.nextRun);
  document.getElementById('blog-next-date').textContent = blogFormatDate(nextDate);
  document.getElementById('blog-next-time').textContent = blogFormatTime(nextDate);
  document.getElementById('blog-cron').textContent = schedule.cron;

  updateCountdown(nextDate);
  if (_blogCountdownInterval) clearInterval(_blogCountdownInterval);
  _blogCountdownInterval = setInterval(() => updateCountdown(nextDate), 60000);
}

function updateCountdown(target) {
  const now = new Date();
  const diff = target - now;
  const el = document.getElementById('blog-countdown');

  if (diff <= 0) {
    el.textContent = 'Running now or overdue';
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  el.textContent = parts.join(' ');
}

// --- Blog Posts ---

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

async function loadBlogPosts() {
  const postsLoading = document.getElementById('blog-posts-loading');
  const postsError = document.getElementById('blog-posts-error');
  const postsEmpty = document.getElementById('blog-posts-empty');
  const list = document.getElementById('blog-list');

  postsLoading.classList.remove('hidden');
  postsError.classList.add('hidden');
  postsEmpty.classList.add('hidden');
  list.classList.add('hidden');

  try {
    const res = await fetch(WIKI_RAW_BASE + '/Home.md');
    if (!res.ok) throw new Error('Failed to fetch blog index');
    const markdown = await res.text();
    const posts = parseIndex(markdown);

    postsLoading.classList.add('hidden');

    if (!posts.length) {
      postsEmpty.classList.remove('hidden');
      return;
    }

    list.innerHTML = posts.map(p => {
      // Parse the wiki date line (e.g. "2026-02-23 — All Projects") to format consistently
      const datePart = p.date.split('—')[0].trim();
      const parsed = new Date(datePart + 'T00:00:00');
      const formattedDate = !isNaN(parsed) ? blogFormatDate(parsed) : blogEscapeHtml(p.date);

      return `
        <div class="blog-card" data-slug="${blogEscapeHtml(p.slug)}">
          <div class="blog-card-header">
            <h3 class="blog-card-title">${blogEscapeHtml(p.title)}</h3>
            <span class="blog-card-date">${formattedDate}</span>
          </div>
          <p class="blog-card-abstract">${blogEscapeHtml(p.abstract)}</p>
        </div>
      `;
    }).join('');

    list.classList.remove('hidden');

    list.querySelectorAll('.blog-card').forEach(card => {
      card.addEventListener('click', () => openPost(card.dataset.slug));
    });
  } catch (err) {
    postsLoading.classList.add('hidden');
    postsError.textContent = 'Failed to load blog posts: ' + err.message;
    postsError.classList.remove('hidden');
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
    detailBody.innerHTML = '<p class="error-state">Failed to load post: ' + blogEscapeHtml(err.message) + '</p>';
  }
}

function closeBlogPost() {
  document.getElementById('blog-detail').classList.add('hidden');
  document.getElementById('blog-list').classList.remove('hidden');
}

// --- Run History (collapsible) ---

function renderRunHistory(runs) {
  const list = document.getElementById('blog-runs-list');
  const toggleBtn = document.getElementById('blog-runs-toggle');

  if (!runs.length) {
    list.innerHTML = '<p class="no-data">No workflow runs found.</p>';
    toggleBtn.classList.add('hidden');
    return;
  }

  // Stats summary
  const total = runs.length;
  const successes = runs.filter(r => r.conclusion === 'success').length;
  const failures = runs.filter(r => r.conclusion === 'failure').length;
  document.getElementById('blog-stats-total').textContent = total;
  document.getElementById('blog-stats-success').textContent = successes;
  document.getElementById('blog-stats-failure').textContent = failures;

  // Build all cards
  _allRunCards = runs.map((run, i) => {
    const date = new Date(run.createdAt);
    const dateStr = blogFormatDate(date);
    const timeStr = blogFormatTime(date);
    const isSuccess = run.conclusion === 'success';
    const statusClass = isSuccess ? 'run-success' : 'run-failure';
    const statusLabel = isSuccess ? 'Success' : 'Failed';
    const triggerLabel = run.event === 'schedule' ? 'Scheduled' : 'Manual';

    let failureHtml = '';
    if (!isSuccess && run.failureReason) {
      failureHtml = `<span class="run-failure-reason">${blogEscapeHtml(run.failureReason)}</span>`;
    }

    const hiddenClass = i > 0 ? ' run-card-hidden' : '';

    return `
      <a href="${blogEscapeHtml(run.url)}" target="_blank" rel="noopener" class="run-card ${statusClass}${hiddenClass}">
        <div class="run-card-row">
          <span class="run-status-badge ${statusClass}">${statusLabel}</span>
          <span class="run-trigger">${triggerLabel}</span>
          <span class="run-duration">${blogEscapeHtml(run.duration)}</span>
          ${failureHtml}
          <span class="run-date">${dateStr} ${timeStr}</span>
        </div>
      </a>
    `;
  });

  list.innerHTML = _allRunCards.join('');

  // Show toggle button if more than 1 run
  if (runs.length > 1) {
    _runsExpanded = false;
    toggleBtn.textContent = `Show all ${runs.length} runs`;
    toggleBtn.classList.remove('hidden');
    toggleBtn.onclick = toggleRunHistory;
  } else {
    toggleBtn.classList.add('hidden');
  }
}

function toggleRunHistory() {
  const list = document.getElementById('blog-runs-list');
  const toggleBtn = document.getElementById('blog-runs-toggle');
  const cards = list.querySelectorAll('.run-card');

  _runsExpanded = !_runsExpanded;

  cards.forEach((card, i) => {
    if (i > 0) {
      card.classList.toggle('run-card-hidden', !_runsExpanded);
    }
  });

  toggleBtn.textContent = _runsExpanded
    ? 'Show less'
    : `Show all ${cards.length} runs`;
}

// --- Utility ---

function blogFormatDate(date) {
  return date.toLocaleDateString('en-AU', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

function blogFormatTime(date) {
  return date.toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit'
  });
}

function blogEscapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
