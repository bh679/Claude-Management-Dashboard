async function loadProjectsData() {
  const loading = document.getElementById('projects-loading');
  const error = document.getElementById('projects-error');
  const content = document.getElementById('projects-content');

  loading.classList.remove('hidden');
  error.classList.add('hidden');
  content.classList.add('hidden');

  try {
    const [projectsRes, deploymentsRes, pendingRes] = await Promise.all([
      fetch('/api/cmd/projects'),
      fetch('/api/cmd/deployments').catch(() => null),
      fetch('/api/cmd/pending-repos').catch(() => null)
    ]);

    const data = await projectsRes.json();
    const deployments = deploymentsRes ? await deploymentsRes.json() : {};
    const pendingRepos = pendingRes ? await pendingRes.json() : [];

    loading.classList.add('hidden');

    if (data.error === 'schema_incompatible') {
      error.textContent = 'Dashboard data format has changed. Please update the dashboard.';
      error.title = data.message || '';
      error.classList.remove('hidden');
      return;
    }

    if (!data.projects || !data.projects.length) {
      error.textContent = 'No project data available';
      error.classList.remove('hidden');
      return;
    }

    renderProjectsSummary(data.summary);
    renderProjectCards(data.projects, deployments);
    renderPendingRepos(Array.isArray(pendingRepos) ? pendingRepos : []);
    renderReportDate(data.report_date);
    content.classList.remove('hidden');

    // Load report summary card
    loadReportSummary();
  } catch (err) {
    loading.classList.add('hidden');
    error.textContent = 'Failed to load projects: ' + err.message;
    error.classList.remove('hidden');
  }
}

function renderProjectsSummary(summary) {
  document.getElementById('projects-total').textContent = summary.total_projects;
  document.getElementById('projects-moving').textContent = summary.moving_well;
  document.getElementById('projects-at-risk').textContent = summary.at_risk;
  document.getElementById('projects-commits').textContent = summary.total_commits_7d;
  document.getElementById('projects-prs').textContent = summary.total_merged_prs_7d;
}

function renderReportDate(date) {
  const el = document.getElementById('projects-report-date');
  if (el && date) {
    el.textContent = 'Report: ' + date;
  }
}

function getStatusClass(status) {
  if (status === 'moving_well') return 'status-good';
  if (status === 'at_risk') return 'status-warning';
  if (status === 'needs_decision') return 'status-critical';
  return '';
}

function getDeployStatusClass(status) {
  if (status === 'live') return 'deploy-live';
  if (status === 'error') return 'deploy-error';
  if (status === 'offline') return 'deploy-offline';
  return 'deploy-none';
}

function getDeployStatusLabel(status) {
  if (status === 'live') return 'Live';
  if (status === 'error') return 'Error';
  if (status === 'offline') return 'Offline';
  return 'Not Deployed';
}

function renderDeploymentCard(repo, deployment) {
  if (!deployment) {
    return `
      <div class="deployment-card deploy-none">
        <span class="deploy-status-badge deploy-none">Not Deployed</span>
      </div>
    `;
  }

  const statusClass = getDeployStatusClass(deployment.status);
  const statusLabel = getDeployStatusLabel(deployment.status);

  const allUrls = [
    ...(deployment.url ? [deployment.url] : []),
    ...(deployment.additional_urls || [])
  ];
  const liveLink = allUrls.map(u =>
    `<a class="deploy-link" href="${escapeHtml(u)}" target="_blank" onclick="event.stopPropagation();">${escapeHtml(u.replace(/^https?:\/\//, ''))}</a>`
  ).join('');

  const serverInfo = deployment.server
    ? `<div class="deploy-server">
        <a class="deploy-server-link" href="${escapeHtml(deployment.server_url)}" target="_blank" onclick="event.stopPropagation();">${escapeHtml(deployment.server)}</a>
        ${deployment.region ? `<span class="deploy-region">${escapeHtml(deployment.region)}</span>` : ''}
      </div>`
    : '';

  const responseTime = deployment.responseTime != null
    ? `<span class="deploy-response-time">${deployment.responseTime}ms</span>`
    : '';

  return `
    <div class="deployment-card ${statusClass}">
      <span class="deploy-status-badge ${statusClass}">${statusLabel}</span>
      ${responseTime}
      ${liveLink}
      ${serverInfo}
    </div>
  `;
}

function renderProjectCards(projects, deployments) {
  const grid = document.getElementById('projects-grid');
  grid.innerHTML = projects.map(p => {
    const statusClass = getStatusClass(p.status);
    const risksHtml = p.risks && p.risks.length
      ? `<div class="project-risks">${p.risks.map(r =>
          `<span class="project-risk">${escapeHtml(r.summary)}</span>`
        ).join('')}</div>`
      : '';
    const daysSince = p.metrics.days_since_last_commit;
    const lastCommitLabel = daysSince === 0 ? 'Today' : daysSince === 1 ? '1 day ago' : daysSince + ' days ago';

    const deployment = deployments[p.repo] || null;

    return `
      <div class="project-row">
        <a class="project-card" href="https://github.com/${escapeHtml(p.repo)}" target="_blank">
          <div class="project-card-header">
            <span class="project-name">${escapeHtml(p.name)}</span>
            <span class="project-status-badge ${statusClass}">${escapeHtml(p.status_label)}</span>
          </div>
          <div class="project-description">${escapeHtml(p.description)}</div>
          <div class="project-metrics">
            <span class="project-metric">${p.metrics.commits_7d} commits</span>
            <span class="project-metric">${p.metrics.merged_prs_7d} PRs merged</span>
            <span class="project-metric">${p.metrics.open_prs} open PRs</span>
            <span class="project-metric">Last: ${lastCommitLabel}</span>
          </div>
          ${risksHtml}
        </a>
        ${renderDeploymentCard(p.repo, deployment)}
      </div>
    `;
  }).join('');
}

// Report summary at bottom of projects tab
async function loadReportSummary() {
  const card = document.getElementById('report-summary-card');
  const reportError = document.getElementById('report-summary-error');

  try {
    const res = await fetch('/api/cmd/reports/latest');
    const data = await res.json();

    if (!data.markdown) {
      card.classList.add('hidden');
      return;
    }

    document.getElementById('report-summary-title').textContent = 'COO Report';
    document.getElementById('report-summary-date').textContent = data.date;

    // Extract first paragraph as preview
    const lines = data.markdown.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const preview = lines.slice(0, 2).join(' ').slice(0, 200);
    document.getElementById('report-summary-preview').textContent = preview ? preview + '...' : '';

    card.classList.remove('hidden');

    // Store full report data for inline expansion
    window._latestReportData = data;
  } catch (err) {
    reportError.textContent = 'Could not load latest report';
    reportError.classList.remove('hidden');
  }
}

function openLatestReport() {
  const data = window._latestReportData;
  if (!data) return;

  document.getElementById('report-summary-card').classList.add('hidden');
  document.getElementById('report-detail-section').classList.remove('hidden');
  document.getElementById('report-detail-title').textContent = 'COO Report';
  document.getElementById('report-detail-date').textContent = data.date;
  document.getElementById('report-detail-body').innerHTML = marked.parse(data.markdown);
}

function closeReportDetail() {
  document.getElementById('report-detail-section').classList.add('hidden');
  document.getElementById('report-summary-card').classList.remove('hidden');
}

async function showAllReports() {
  const listSection = document.getElementById('reports-list-section');
  const listContainer = document.getElementById('reports-list');
  const summaryCard = document.getElementById('report-summary-card');

  summaryCard.classList.add('hidden');
  listSection.classList.remove('hidden');

  try {
    const res = await fetch('/api/cmd/reports/list');
    const reports = await res.json();

    listContainer.innerHTML = reports.map(r => `
      <a class="report-list-item" href="#" onclick="openReport('${escapeHtml(r.name)}'); return false;">
        <span class="report-list-title">COO Report</span>
        <span class="report-list-date">${escapeHtml(r.date)}</span>
      </a>
    `).join('');
  } catch (err) {
    listContainer.innerHTML = '<p class="error-state">Failed to load reports list</p>';
  }
}

async function openReport(filename) {
  try {
    const res = await fetch('/api/cmd/reports/latest');
    // For now just load latest — could add /api/reports/:filename endpoint later
    const data = await res.json();
    if (!data.markdown) return;

    document.getElementById('reports-list-section').classList.add('hidden');
    document.getElementById('report-detail-section').classList.remove('hidden');
    document.getElementById('report-detail-title').textContent = 'COO Report';
    document.getElementById('report-detail-date').textContent = data.date;
    document.getElementById('report-detail-body').innerHTML = marked.parse(data.markdown);
  } catch (err) {
    // silently fail
  }
}

function closeReportsList() {
  document.getElementById('reports-list-section').classList.add('hidden');
  document.getElementById('report-summary-card').classList.remove('hidden');
}

function renderPendingRepos(repos) {
  const section = document.getElementById('pending-repos-section');
  const grid = document.getElementById('pending-repos-grid');
  const countEl = document.getElementById('pending-repos-count');

  if (!repos.length) {
    section.classList.add('hidden');
    return;
  }

  countEl.textContent = repos.length + ' repo' + (repos.length === 1 ? '' : 's');

  grid.innerHTML = repos.map(r => {
    const repoName = r.repo.split('/').pop();
    const lastCommit = formatRelativeDate(r.last_commit);
    const discovered = formatRelativeDate(r.discovered_at);

    return `
      <a class="pending-card" href="https://github.com/${escapeHtml(r.repo)}" target="_blank">
        <div class="pending-card-header">
          <span class="pending-card-name">${escapeHtml(repoName)}</span>
          <span class="pending-badge">Pending</span>
        </div>
        <div class="pending-card-description">${escapeHtml(r.description || '')}</div>
        <div class="pending-card-meta">
          <span>Last commit: ${lastCommit}</span>
          <span>Discovered: ${discovered}</span>
        </div>
      </a>
    `;
  }).join('');

  section.classList.remove('hidden');
}

function formatRelativeDate(isoDate) {
  if (!isoDate) return 'Unknown';
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return diffDays + ' days ago';
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  return diffMonths + ' months ago';
}
