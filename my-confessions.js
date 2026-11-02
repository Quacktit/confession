(async function () {
  await requireAuth();
  bindLogout();
  const list = document.getElementById('my-list');
  const { posts, draft } = await api('/api/my');
  function card(text, meta, isDraft, status) {
    const c = document.createElement('article'); c.className = 'card' + (isDraft ? ' draft' : '');
    if (isDraft) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'DRAFT'; c.append(b); }
    const p = document.createElement('p'); p.className = 'card-text'; p.textContent = text;
    const m = document.createElement('div'); m.className = 'card-meta';
    if (isDraft) { const a = document.createElement('a'); a.href = '/confessions.html'; a.textContent = 'Continue writing → '; m.append(a, document.createTextNode(meta)); }
    else m.textContent = meta;
    if (status && status !== 'approved') { const b = document.createElement('span'); b.className = 'badge'; b.textContent = status === 'pending' ? 'IN REVIEW' : 'NOT PUBLISHED'; c.prepend(b); }
    c.append(p, m); return c;
  }
  if (draft) list.append(card(draft.text, 'Autosaved ' + formatDate(draft.updatedAt), true));
  posts.forEach((p) => list.append(card(p.text, formatDate(p.createdAt), false, p.status)));
  if (!draft && !posts.length) { const e = document.createElement('p'); e.className = 'empty'; e.textContent = 'You have not shared anything yet.'; list.append(e); }
})();
