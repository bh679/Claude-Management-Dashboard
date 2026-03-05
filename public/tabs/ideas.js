const IDEA_SECTIONS = [
  { key: 'opportunities', label: 'Opportunities', icon: '🔭' },
  { key: 'projects', label: 'New Projects', icon: '🚀' },
  { key: 'features', label: 'Features', icon: '🔧' }
];

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
    const res = await fetch('/api/cmd/ideas');
    const data = await res.json();

    loading.classList.add('hidden');

    const totalItems = IDEA_SECTIONS.reduce(
      (sum, s) => sum + (data[s.key] || []).length, 0
    );

    if (totalItems === 0) {
      empty.classList.remove('hidden');
      return;
    }

    list.innerHTML = IDEA_SECTIONS
      .filter(section => (data[section.key] || []).length > 0)
      .map(section => renderSection(section, data[section.key]))
      .join('');

    list.classList.remove('hidden');
  } catch (err) {
    loading.classList.add('hidden');
    error.textContent = 'Failed to load ideas: ' + err.message;
    error.classList.remove('hidden');
  }
}

function renderSection(section, items) {
  return `
    <div class="ideas-section">
      <div class="ideas-section-header">
        <span class="ideas-section-title">${section.icon} ${section.label}</span>
        <span class="ideas-section-count">${items.length}</span>
      </div>
      <div class="ideas-section-grid">
        ${items.map(item => renderCard(item, section.key)).join('')}
      </div>
    </div>
  `;
}

function renderCard(item, type) {
  const tags = (item.tags || []).map(t => `<span class="idea-tag">${escapeHtml(t)}</span>`).join('');
  const effort = item.effort ? `<span class="idea-effort idea-effort-${escapeHtml(item.effort).toLowerCase()}">${escapeHtml(item.effort)}</span>` : '';
  const status = item.status ? `<span class="idea-status idea-type-${type}">${escapeHtml(item.status)}</span>` : '';
  const description = item.description || '';
  const parentProject = item.parent_project ? `<span class="idea-parent">${escapeHtml(item.parent_project)}</span>` : '';

  return `
    <div class="idea-card idea-card-${type}">
      <div class="idea-card-header">
        <span class="idea-title">${escapeHtml(item.title)}</span>
        <div class="idea-badges">
          ${effort}${status}
        </div>
      </div>
      ${description ? `<div class="idea-body">${escapeHtml(truncate(description, 200))}</div>` : ''}
      <div class="idea-card-footer">
        ${parentProject}
        ${tags ? `<div class="idea-tags">${tags}</div>` : ''}
      </div>
    </div>
  `;
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
