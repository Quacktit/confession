async function api(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong.'); e.status = res.status; throw e; }
  return data;
}
async function requireAuth() {
  try { await api('/api/me'); }
  catch (e) { window.location.href = '/login.html'; throw e; }
}
function formatDate(ms) {
  return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function bindLogout() {
  const btn = document.getElementById('logout');
  if (btn) btn.addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); window.location.href = '/login.html'; });
}
