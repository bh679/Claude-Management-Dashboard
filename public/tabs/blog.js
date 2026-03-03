let _blogCountdownInterval = null;

async function loadBlogData() {
  const loading = document.getElementById('blog-loading');
  const error = document.getElementById('blog-error');
  const content = document.getElementById('blog-content');

  loading.classList.remove('hidden');
  error.classList.add('hidden');
  content.classList.add('hidden');

  try {
    const res = await fetch('/api/blog/runs');
    const data = await res.json();

    loading.classList.add('hidden');

    renderSchedule(data.schedule);
    renderRunHistory(data.runs);

    content.classList.remove('hidden');
  } catch (err) {
    loading.classList.add('hidden');
    error.textContent = 'Failed to load blog data: ' + err.message;
    error.classList.remove('hidden');
  }
}

function renderSchedule(schedule) {
  const nextDate = new Date(schedule.nextRun);
  document.getElementById('blog-next-date').textContent = nextDate.toLocaleDateString('en-AU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  document.getElementById('blog-next-time').textContent = nextDate.toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
  });
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

function renderRunHistory(runs) {
  const list = document.getElementById('blog-runs-list');

  if (!runs.length) {
    list.innerHTML = '<p class="no-data">No workflow runs found.</p>';
    return;
  }

  // Stats summary
  const total = runs.length;
  const successes = runs.filter(r => r.conclusion === 'success').length;
  const failures = runs.filter(r => r.conclusion === 'failure').length;
  document.getElementById('blog-stats-total').textContent = total;
  document.getElementById('blog-stats-success').textContent = successes;
  document.getElementById('blog-stats-failure').textContent = failures;

  list.innerHTML = runs.map(run => {
    const date = new Date(run.createdAt);
    const dateStr = date.toLocaleDateString('en-AU', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('en-AU', {
      hour: '2-digit', minute: '2-digit'
    });
    const isSuccess = run.conclusion === 'success';
    const statusClass = isSuccess ? 'run-success' : 'run-failure';
    const statusLabel = isSuccess ? 'Success' : 'Failed';
    const triggerLabel = run.event === 'schedule' ? 'Scheduled' : 'Manual';

    let failureHtml = '';
    if (!isSuccess && run.failureReason) {
      failureHtml = `<div class="run-failure-reason">${blogEscapeHtml(run.failureReason)}</div>`;
    }

    return `
      <a href="${blogEscapeHtml(run.url)}" target="_blank" rel="noopener" class="run-card ${statusClass}">
        <div class="run-card-header">
          <span class="run-status-badge ${statusClass}">${statusLabel}</span>
          <span class="run-trigger">${triggerLabel}</span>
        </div>
        <div class="run-card-body">
          <span class="run-date">${dateStr} ${timeStr}</span>
          <span class="run-duration">${blogEscapeHtml(run.duration)}</span>
        </div>
        ${failureHtml}
      </a>
    `;
  }).join('');
}

function blogEscapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
