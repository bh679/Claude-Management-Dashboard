async function loadProjectsData() {
  const loading = document.getElementById('projects-loading');
  const error = document.getElementById('projects-error');
  const content = document.getElementById('projects-content');

  loading.classList.remove('hidden');
  error.classList.add('hidden');
  content.classList.add('hidden');

  try {
    const [projectsRes, deploymentsRes, repoStatsRes, pendingRes] = await Promise.all([
      fetch('/api/cmd/projects'),
      fetch('/api/cmd/deployments').catch(() => null),
      fetch('/api/cmd/repo-stats').catch(() => null),
      fetch('/api/cmd/pending-repos').catch(() => null)
    ]);

    const data = await projectsRes.json();
    const deployments = (deploymentsRes && deploymentsRes.ok)
      ? await deploymentsRes.json()
      : {};
    const repoStats = (repoStatsRes && repoStatsRes.ok)
      ? await repoStatsRes.json()
      : {};
    const pendingRepos = (pendingRes && pendingRes.ok)
      ? await pendingRes.json()
      : [];

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
    renderProjectCards(data.projects, deployments, repoStats);
    renderPendingRepos(Array.isArray(pendingRepos) ? pendingRepos : [], data.projects || []);
    renderReportDate(data.report_date);
    content.classList.remove('hidden');

    // Load report summary card and schedule
    loadReportSummary();
    loadReportSchedule();
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

function getStatusDotColor(status) {
  if (status === 'moving_well') return '#4caf50';
  if (status === 'at_risk') return '#e0b050';
  if (status === 'needs_decision') return '#e07070';
  return '#666';
}

function getDeployStatusClass(status) {
  if (status === 'live') return 'deploy-live';
  if (status === 'error') return 'deploy-error';
  if (status === 'offline') return 'deploy-offline';
  if (status === 'operator') return 'deploy-operator';
  return 'deploy-none';
}

function getDeployStatusLabel(status) {
  if (status === 'live') return 'Live';
  if (status === 'error') return 'Error';
  if (status === 'offline') return 'Offline';
  if (status === 'operator') return 'Operator';
  return 'Not Deployed';
}

function renderActivityGraph(activity) {
  if (!activity || !activity.length) return '';
  const max = Math.max(...activity, 1);
  const bars = activity.map(v => {
    const height = Math.round((v / max) * 20);
    const opacity = v === 0 ? 0.15 : 0.4 + (v / max) * 0.6;
    return `<div class="activity-bar" style="height:${Math.max(height, 2)}px;opacity:${opacity}"></div>`;
  }).join('');
  return `<div class="repo-activity-graph">${bars}</div>`;
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

function getContribLevel(count) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

function renderContributionGraph(dailyCommits) {
  if (!dailyCommits || dailyCommits.length === 0) {
    return '<div class="contrib-graph contrib-empty"></div>';
  }
  const cells = dailyCommits.map(d => {
    const level = getContribLevel(d.count);
    const dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const tooltip = d.count === 0 ? `${dateLabel}: No activity` : `${dateLabel}: ${d.count} commit${d.count !== 1 ? 's' : ''}`;
    return `<div class="contrib-cell contrib-level-${level}" title="${tooltip}"></div>`;
  });
  const half = Math.ceil(cells.length / 2);
  const row1 = cells.slice(0, half).join('');
  const row2 = cells.slice(half).join('');
  return `
    <div class="contrib-graph">
      <div class="contrib-row">${row1}</div>
      <div class="contrib-row">${row2}</div>
    </div>
  `;
}

function combineDailyCommits(repoList, repoStats) {
  const dateMap = {};
  for (const repo of repoList) {
    const stats = repoStats[repo];
    if (!stats || !stats.dailyCommits) continue;
    for (const d of stats.dailyCommits) {
      dateMap[d.date] = (dateMap[d.date] || 0) + d.count;
    }
  }
  return Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

function renderTileSquares(activity) {
  if (!activity || !activity.length) return '';
  const max = Math.max(...activity, 1);
  const squares = activity.map(v => {
    const opacity = v === 0 ? 0.1 : 0.3 + (v / max) * 0.7;
    return `<span class="activity-square" style="opacity:${opacity}"></span>`;
  }).join('');
  return `<div class="repo-activity-squares">${squares}</div>`;
}

function renderRepoTile(project, role, parentBoardUrl) {
  const dotColor = getStatusDotColor(project.status);
  const borderClass = role === 'main' ? 'repo-main' : 'repo-child';
  const repoName = project.name || project.repo.split('/')[1];
  const m = project.metrics || {};

  const hasOwnBoard = project.board_url && project.board_url !== parentBoardUrl;
  const boardBtn = hasOwnBoard
    ? `<a class="repo-board-btn" href="${escapeHtml(project.board_url)}" target="_blank" onclick="event.stopPropagation();" title="Project Board" style="color:${dotColor}">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75C0 .784.784 0 1.75 0zM1.5 1.75v12.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25H1.75a.25.25 0 00-.25.25zM11.75 3a.75.75 0 01.75.75v7.5a.75.75 0 01-1.5 0v-7.5a.75.75 0 01.75-.75zm-8.25.75a.75.75 0 011.5 0v5.5a.75.75 0 01-1.5 0zM8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z"/></svg>
      </a>`
    : '';

  return `
    <div class="project-repo-tile ${borderClass}">
      <div class="repo-tile-header">
        <a class="repo-tile-name" href="https://github.com/${escapeHtml(project.repo)}" target="_blank">
          <span class="repo-status-dot" style="background:${dotColor}"></span>
          ${escapeHtml(repoName)}
        </a>
        ${boardBtn}
      </div>
      <div class="repo-tile-metrics">
        <span>${m.commits_7d || 0} c</span>
        <span>${m.open_prs || 0} pr</span>
        <span>${m.merged_prs_7d || 0} m</span>
        ${renderTileSquares(project.activity)}
      </div>
    </div>
  `;
}

function getOpenTaskCount(stats) {
  if (!stats || !stats.projectBoards) return null;
  return stats.projectBoards.reduce((sum, b) => sum + b.openItems, 0);
}

function getProjectBoardUrl(stats) {
  if (!stats || !stats.projectBoards || stats.projectBoards.length === 0) return null;
  return stats.projectBoards[0].url;
}

function renderProjectCards(projects, deployments, repoStats) {
  const grid = document.getElementById('projects-grid');
  grid.innerHTML = projects.map(p => {
    const statusClass = getStatusClass(p.status);
    const risksHtml = p.risks && p.risks.length
      ? `<div class="project-risks">${p.risks.map(r =>
          `<span class="project-risk">${escapeHtml(r.summary)}</span>`
        ).join('')}</div>`
      : '';

    const cm = p.combined_metrics || p.metrics;
    const daysSince = cm.days_since_last_commit;
    const lastCommitLabel = daysSince === 0 ? 'Today'
      : daysSince === 1 ? '1d ago'
      : daysSince != null ? daysSince + 'd ago'
      : '?';

    const deployment = deployments[p.repo] || null;
    const stats = repoStats ? repoStats[p.repo] : null;
    const taskCount = getOpenTaskCount(stats);
    const boardUrl = getProjectBoardUrl(stats);

    const issuesLabel = stats ? stats.openIssues : '?';
    const tasksLabel = taskCount != null ? taskCount : '?';

    const boardItemCount = (stats ? stats.openIssues : 0) + (taskCount || 0);
    const boardBadge = boardItemCount > 0 ? `<span class="board-badge">${boardItemCount}</span>` : '';
    const boardLink = boardUrl
      ? `<a class="project-board-link" href="${escapeHtml(boardUrl)}" target="_blank" onclick="event.stopPropagation();">Board${boardBadge}</a>`
      : '';

    // Render repo tiles: main + children
    const children = p.children || [];
    const hasRepoTiles = children.length > 0;
    const parentBoardUrl = p.board_url || null;

    let repoTilesHtml = '';
    if (hasRepoTiles) {
      const mainTile = renderRepoTile(p, 'main', parentBoardUrl);
      const childTiles = children.map(c => renderRepoTile(c, 'child', parentBoardUrl)).join('');
      repoTilesHtml = `<div class="project-repos">${mainTile}${childTiles}</div>`;
    }

    // Card-level board button
    const cardBoardBtn = p.board_url
      ? `<a class="card-board-btn" href="${escapeHtml(p.board_url)}" target="_blank" title="Project Board">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75C0 .784.784 0 1.75 0zM1.5 1.75v12.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25H1.75a.25.25 0 00-.25.25zM11.75 3a.75.75 0 01.75.75v7.5a.75.75 0 01-1.5 0v-7.5a.75.75 0 01.75-.75zm-8.25.75a.75.75 0 011.5 0v5.5a.75.75 0 01-1.5 0zM8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z"/></svg>
        </a>`
      : '';

    // Combined contribution graph from repo-stats
    const allRepos = [p.repo, ...children.map(c => c.repo)];
    const dailyCommits = combineDailyCommits(allRepos, repoStats);
    const contribGraph = renderContributionGraph(dailyCommits);

    return `
      <div class="project-row">
        <div class="project-card">
          <div class="project-card-header">
            <a class="project-name-link" href="https://github.com/${escapeHtml(p.repo)}" target="_blank">
              <span class="project-name">${escapeHtml(p.name)}</span>
            </a>
            <div class="project-header-right">
              ${cardBoardBtn}
              <span class="project-status-badge ${statusClass}">${escapeHtml(p.status_label)}</span>
            </div>
          </div>
          <div class="project-description">${escapeHtml(p.description)}</div>
          <div class="project-metrics">
            <span class="project-metric">${cm.commits_7d} c</span>
            <span class="project-metric">${cm.open_prs} pr</span>
            <span class="project-metric">${cm.merged_prs_7d} m</span>
            <span class="project-metric">Last: ${lastCommitLabel}</span>
          </div>
          ${contribGraph}
          ${risksHtml}
          ${repoTilesHtml}
        </div>
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

function renderPendingRepos(repos, trackedProjects) {
  const section = document.getElementById('pending-repos-section');
  const grid = document.getElementById('pending-repos-grid');
  const countEl = document.getElementById('pending-repos-count');

  // Store tracked projects for reject dropdown
  window._trackedProjects = trackedProjects || [];

  if (!repos.length) {
    section.classList.add('hidden');
    return;
  }

  countEl.textContent = repos.length + ' repo' + (repos.length === 1 ? '' : 's');

  grid.innerHTML = repos.map(r => {
    const repoName = r.repo.split('/').pop();
    const lastCommit = formatRelativeDate(r.last_commit);
    const discovered = formatRelativeDate(r.discovered_at);
    const cardId = encodeRepoId(r.repo);
    const descAttr = escapeAttr(r.description || '');

    return `
      <div class="pending-row" id="pending-${cardId}">
        <div class="pending-card">
          <div class="pending-card-header">
            <a class="pending-card-name" href="https://github.com/${escapeHtml(r.repo)}" target="_blank" onclick="event.stopPropagation();">${escapeHtml(repoName)}</a>
          </div>
          <div class="pending-card-description">${escapeHtml(r.description || '')}</div>
          <div class="pending-card-meta">
            <span>Last commit: ${lastCommit}</span>
            <span>Discovered: ${discovered}</span>
          </div>
        </div>
        <div class="pending-actions" id="actions-${cardId}">
          <span class="pending-badge">Pending</span>
          <button class="pending-btn pending-btn-approve" onclick="approvePending('${escapeHtml(r.repo)}', '${descAttr}')">Approve</button>
          <button class="pending-btn pending-btn-subproject" onclick="showSubProjectForm('${escapeHtml(r.repo)}', '${descAttr}')">Add Parent</button>
          <button class="pending-btn pending-btn-reject" onclick="showRejectForm('${escapeHtml(r.repo)}', '${descAttr}')">Reject</button>
        </div>
      </div>
    `;
  }).join('');

  section.classList.remove('hidden');
}

function encodeRepoId(repo) {
  return repo.replace(/\//g, '-');
}

function escapeAttr(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

async function approvePending(repo, description) {
  const cardId = encodeRepoId(repo);
  const card = document.getElementById('pending-' + cardId);
  if (!card) return;

  setCardLoading(card, true);

  try {
    const res = await fetch('/api/cmd/pending-repos/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, description })
    });
    const result = await res.json();

    if (!res.ok) {
      showPendingStatus('error', result.message || 'Approval failed');
      setCardLoading(card, false);
      return;
    }

    card.classList.add('pending-card-removing');
    setTimeout(() => {
      card.remove();
      updatePendingCount();
      showPendingStatus('success', repo.split('/')[1] + ' approved and now tracked');
    }, 300);
  } catch (err) {
    showPendingStatus('error', 'Network error: ' + err.message);
    setCardLoading(card, false);
  }
}

function showRejectForm(repo, description) {
  const cardId = encodeRepoId(repo);
  const actionsDiv = document.getElementById('actions-' + cardId);
  if (!actionsDiv) return;

  // Store original HTML for cancel
  window['_rejectOriginal_' + cardId] = actionsDiv.innerHTML;

  const trackedOptions = (window._trackedProjects || [])
    .map(t => `<option value="${escapeHtml(t.repo)}">${escapeHtml(t.name || t.repo.split('/')[1])}</option>`)
    .join('');

  actionsDiv.classList.add('pending-actions-expanded');
  actionsDiv.innerHTML = `
    <div class="reject-form">
      <input class="reject-reason-input" type="text" placeholder="Reason (optional)" id="reject-reason-${cardId}">
      <div class="reject-replaced-row">
        <label class="reject-label">Replaced by:</label>
        <select class="reject-select" id="reject-replaced-${cardId}">
          <option value="">None</option>
          ${trackedOptions}
        </select>
      </div>
      <div class="reject-form-actions">
        <button class="pending-btn pending-btn-reject-confirm" onclick="confirmReject('${escapeHtml(repo)}', '${escapeAttr(description)}')">Confirm Reject</button>
        <button class="pending-btn pending-btn-cancel" onclick="cancelReject('${escapeHtml(repo)}')">Cancel</button>
      </div>
    </div>
  `;
}

function cancelReject(repo) {
  const cardId = encodeRepoId(repo);
  const actionsDiv = document.getElementById('actions-' + cardId);
  const key = '_rejectOriginal_' + cardId;
  if (actionsDiv && window[key]) {
    actionsDiv.innerHTML = window[key];
    actionsDiv.classList.remove('pending-actions-expanded');
  }
  delete window[key];
}

async function confirmReject(repo, description) {
  const cardId = encodeRepoId(repo);
  const card = document.getElementById('pending-' + cardId);
  if (!card) return;

  const reasonInput = document.getElementById('reject-reason-' + cardId);
  const replacedSelect = document.getElementById('reject-replaced-' + cardId);
  const reason = reasonInput ? reasonInput.value.trim() : '';
  const replacedBy = replacedSelect ? replacedSelect.value : '';

  setCardLoading(card, true);

  try {
    const body = { repo, description };
    if (reason) body.reason = reason;
    if (replacedBy) body.replacedBy = replacedBy;

    const res = await fetch('/api/cmd/pending-repos/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await res.json();

    if (!res.ok) {
      showPendingStatus('error', result.message || 'Rejection failed');
      setCardLoading(card, false);
      return;
    }

    card.classList.add('pending-card-removing');
    setTimeout(() => {
      card.remove();
      updatePendingCount();
      showPendingStatus('success', repo.split('/')[1] + ' rejected and moved to untracked');
    }, 300);
  } catch (err) {
    showPendingStatus('error', 'Network error: ' + err.message);
    setCardLoading(card, false);
  }
}

function showSubProjectForm(repo, description) {
  const cardId = encodeRepoId(repo);
  const actionsDiv = document.getElementById('actions-' + cardId);
  if (!actionsDiv) return;

  // Store original HTML for cancel
  window['_subprojectOriginal_' + cardId] = actionsDiv.innerHTML;

  const trackedOptions = (window._trackedProjects || [])
    .map(t => `<option value="${escapeHtml(t.repo)}">${escapeHtml(t.name || t.repo.split('/')[1])}</option>`)
    .join('');

  actionsDiv.classList.add('pending-actions-expanded');
  actionsDiv.innerHTML = `
    <div class="reject-form">
      <div class="reject-replaced-row">
        <label class="reject-label">Parent:</label>
        <select class="reject-select" id="subproject-parent-${cardId}">
          <option value="">Select parent...</option>
          ${trackedOptions}
        </select>
      </div>
      <div class="reject-form-actions">
        <button class="pending-btn pending-btn-subproject-confirm" onclick="confirmSubProject('${escapeHtml(repo)}', '${escapeAttr(description)}')">Confirm</button>
        <button class="pending-btn pending-btn-cancel" onclick="cancelSubProject('${escapeHtml(repo)}')">Cancel</button>
      </div>
    </div>
  `;
}

function cancelSubProject(repo) {
  const cardId = encodeRepoId(repo);
  const actionsDiv = document.getElementById('actions-' + cardId);
  const key = '_subprojectOriginal_' + cardId;
  if (actionsDiv && window[key]) {
    actionsDiv.innerHTML = window[key];
    actionsDiv.classList.remove('pending-actions-expanded');
  }
  delete window[key];
}

async function confirmSubProject(repo, description) {
  const cardId = encodeRepoId(repo);
  const card = document.getElementById('pending-' + cardId);
  if (!card) return;

  const parentSelect = document.getElementById('subproject-parent-' + cardId);
  const parent = parentSelect ? parentSelect.value : '';

  if (!parent) {
    showPendingStatus('error', 'Please select a parent project');
    return;
  }

  setCardLoading(card, true);

  try {
    const res = await fetch('/api/cmd/pending-repos/add-sub-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, description, parent })
    });
    const result = await res.json();

    if (!res.ok) {
      showPendingStatus('error', result.message || 'Sub-project addition failed');
      setCardLoading(card, false);
      return;
    }

    card.classList.add('pending-card-removing');
    setTimeout(() => {
      card.remove();
      updatePendingCount();
      const repoName = repo.split('/')[1];
      const parentName = parent.split('/')[1];
      showPendingStatus('success', repoName + ' tracked with parent ' + parentName);
    }, 300);
  } catch (err) {
    showPendingStatus('error', 'Network error: ' + err.message);
    setCardLoading(card, false);
  }
}

function setCardLoading(card, loading) {
  if (!card) return;
  const buttons = card.querySelectorAll('button');
  buttons.forEach(function(btn) { btn.disabled = loading; });
  card.classList.toggle('pending-card-loading', loading);
}

function updatePendingCount() {
  const grid = document.getElementById('pending-repos-grid');
  const section = document.getElementById('pending-repos-section');
  const countEl = document.getElementById('pending-repos-count');
  const remaining = grid.querySelectorAll('.pending-row').length;

  if (remaining === 0) {
    section.classList.add('hidden');
  } else {
    countEl.textContent = remaining + ' repo' + (remaining === 1 ? '' : 's');
  }
}

function showPendingStatus(type, message) {
  const el = document.getElementById('pending-action-status');
  if (!el) return;
  el.textContent = message;
  el.className = 'pending-action-status pending-status-' + type;
  el.classList.remove('hidden');
  setTimeout(function() { el.classList.add('hidden'); }, 5000);
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

function formatReportDate(date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'today';
  if (date.toDateString() === tomorrow.toDateString()) return 'tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

async function loadReportSchedule() {
  const el = document.getElementById('reports-schedule');
  if (!el) return;

  try {
    const res = await fetch('/api/cmd/reports/list');
    const reports = await res.json();

    if (!reports || reports.length === 0) return;

    reports.sort((a, b) => b.date.localeCompare(a.date));
    const lastDate = new Date(reports[0].date);

    let frequencyLabel = 'weekly';
    let frequencyDays = 7;

    if (reports.length >= 2) {
      const gaps = [];
      for (let i = 0; i < reports.length - 1; i++) {
        const d1 = new Date(reports[i].date);
        const d2 = new Date(reports[i + 1].date);
        gaps.push((d1 - d2) / (1000 * 60 * 60 * 24));
      }
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      frequencyDays = Math.round(avgGap);
      if (frequencyDays <= 1) frequencyLabel = 'daily';
      else if (frequencyDays <= 7) frequencyLabel = 'weekly';
      else if (frequencyDays <= 14) frequencyLabel = 'bi-weekly';
      else frequencyLabel = 'monthly';
    }

    const nextRun = new Date(lastDate);
    nextRun.setDate(nextRun.getDate() + frequencyDays);

    el.textContent = `Runs ${frequencyLabel} · Next: ${formatReportDate(nextRun)}`;
    el.classList.remove('hidden');
  } catch (err) {
    // schedule subheading is optional — silently skip on error
  }
}
