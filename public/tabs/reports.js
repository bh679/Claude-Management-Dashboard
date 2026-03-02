async function loadReportData() {
  const loading = document.getElementById('reports-loading');
  const error = document.getElementById('reports-error');
  const content = document.getElementById('reports-content');

  loading.classList.remove('hidden');
  error.classList.add('hidden');
  content.classList.add('hidden');

  try {
    const res = await fetch('/api/reports/latest');
    const data = await res.json();

    loading.classList.add('hidden');

    if (!data.markdown) {
      error.textContent = data.message || 'No reports available';
      error.classList.remove('hidden');
      return;
    }

    document.getElementById('report-title').textContent = 'COO Report';
    document.getElementById('report-date').textContent = data.date;
    document.getElementById('report-body').innerHTML = marked.parse(data.markdown);
    content.classList.remove('hidden');
  } catch (err) {
    loading.classList.add('hidden');
    error.textContent = 'Failed to load report: ' + err.message;
    error.classList.remove('hidden');
  }
}
