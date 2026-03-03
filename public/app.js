// Tab routing
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');

function switchTab(tabName) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  panels.forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabName));
  window.location.hash = tabName;

  // Trigger load on first visit
  if (tabName === 'usage' && !window._usageLoaded) {
    window._usageLoaded = true;
    loadUsageData();
  } else if (tabName === 'reports' && !window._reportsLoaded) {
    window._reportsLoaded = true;
    loadReportData();
  } else if (tabName === 'ideas' && !window._ideasLoaded) {
    window._ideasLoaded = true;
    loadIdeasData();
  } else if (tabName === 'blog' && !window._blogLoaded) {
    window._blogLoaded = true;
    loadBlogData();
  }
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// Initial tab from hash or default to usage
const initialTab = window.location.hash.slice(1) || 'usage';
switchTab(initialTab);

window.addEventListener('hashchange', () => {
  const tab = window.location.hash.slice(1);
  if (tab) switchTab(tab);
});
