(async function () {
  await requireAuth();
  bindLogout();
  const box = document.getElementById('write-box');
  const status = document.getElementById('save-status');
  const postBtn = document.getElementById('post-btn');
  const feed = document.getElementById('feed');
  const search = document.getElementById('search');
  const tabs = document.querySelectorAll('.tab');
  let sort = 'latest', timer = null;

  const { draft } = await api('/api/draft');
  if (draft) box.value = draft.text;
  box.addEventListener('input', () => {
    status.textContent = 'Saving draft…';
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { await api('/api/draft', { method: 'PUT', body: JSON.stringify({ text: box.value }) }); status.textContent = 'Draft saved'; }
      catch { status.textContent = 'Could not save draft'; }
    }, 800);
  });

  postBtn.addEventListener('click', async () => {
    postBtn.disabled = true;
    clearTimeout(timer);
    try {
      await api('/api/confessions', { method: 'POST', body: JSON.stringify({ text: box.value }) });
      box.value = ''; status.textContent = 'Submitted for review. It will appear once approved.';
      loadFeed();
    } catch (e) { status.textContent = e.message; }
    postBtn.disabled = false;
  });

  function render(posts) {
    feed.replaceChildren();
    if (!posts.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Nothing here yet.'; feed.append(p); return; }
    posts.forEach((post) => {
      const card = document.createElement('article'); card.className = 'card';
      const text = document.createElement('p'); text.className = 'card-text'; text.textContent = post.text;
      const meta = document.createElement('div'); meta.className = 'card-meta'; meta.textContent = formatDate(post.createdAt);
      let counted = false;
      card.addEventListener('click', () => {
        card.classList.toggle('open');
        if (!counted) { counted = true; api('/api/confessions/' + post.id + '/view', { method: 'POST' }).catch(() => {}); }
      });
      card.append(text, meta); feed.append(card);
    });
  }
  async function loadFeed() {
    const q = encodeURIComponent(search.value.trim());
    render(await api('/api/confessions?sort=' + sort + '&q=' + q));
  }
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.remove('active')); t.classList.add('active');
    sort = t.dataset.sort; loadFeed();
  }));
  let st = null;
  search.addEventListener('input', () => {
    clearTimeout(st);
    if (search.value.trim() && sort !== 'relevant') document.querySelector('[data-sort="relevant"]').click();
    else st = setTimeout(loadFeed, 300);
  });
  loadFeed();
})();
