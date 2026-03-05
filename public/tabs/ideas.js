async function loadIdeasData() {
  const loading = document.getElementById('ideas-loading');
  const error = document.getElementById('ideas-error');
  const empty = document.getElementById('ideas-empty');
  const list = document.getElementById('ideas-list');

  loading.classList.remove('hidden');
  error.classList.add('hidden');
  empty.classList.add('hidden');
  list.classList.add('hidden');

  try {
    const res = await fetch('api/ideas');
    const items = await res.json();

    loading.classList.add('hidden');

    if (!items.length) {
      empty.classList.remove('hidden');
      return;
    }

    list.innerHTML = items.map(item => `
      <div class="idea-card">
        <div class="idea-card-header">
          <span class="idea-title">${escapeHtml(item.title)}</span>
          ${item.status ? `<span class="idea-status">${escapeHtml(item.status)}</span>` : ''}
        </div>
        ${item.body ? `<div class="idea-body">${escapeHtml(truncate(item.body, 200))}</div>` : ''}
      </div>
    `).join('');

    list.classList.remove('hidden');
  } catch (err) {
    loading.classList.add('hidden');
    error.textContent = 'Failed to load ideas: ' + err.message;
    error.classList.remove('hidden');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max) + '...';
}
