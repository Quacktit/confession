(async function () {
  await requireAuth();
  bindLogout();
  const me = await api('/api/me');
  if (!me.admin) { window.location.href = '/confessions.html'; return; }
  const list = document.getElementById('queue');

  async function act(id, action, text, card) {
    try { await api('/api/admin/posts/' + id, { method: 'PUT', body: JSON.stringify({ action, text }) }); card.remove(); empty(); }
    catch (e) { alert(e.message); }
  }
  function empty() {
    if (!list.children.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No posts waiting for review.'; list.append(p); }
  }
  const posts = await api('/api/admin/pending');
  posts.forEach((post) => {
    const card = document.createElement('article'); card.className = 'review-card';
    const meta = document.createElement('div'); meta.className = 'muted'; meta.textContent = formatDate(post.createdAt);
    const ta = document.createElement('textarea'); ta.className = 'review-text'; ta.value = post.text;
    const row = document.createElement('div'); row.className = 'review-actions';
    const ok = document.createElement('button'); ok.className = 'btn'; ok.type = 'button'; ok.textContent = 'Approve & publish';
    const no = document.createElement('button'); no.className = 'btn btn-reject'; no.type = 'button'; no.textContent = 'Reject';
    ok.addEventListener('click', () => act(post.id, 'approve', ta.value, card));
    no.addEventListener('click', () => act(post.id, 'reject', '', card));
    row.append(ok, no); card.append(meta, ta, row); list.append(card);
  });
  empty();
})();
