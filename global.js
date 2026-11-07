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


async function initConfessions() {
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
}

async function initMyConfessions() {
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
}

async function initPrivacy() {
  try { await requireAuth(); } catch (e) { return; }
  bindLogout();
}

function initAuth() {
  const form = document.getElementById('auth-form');
  const title = document.getElementById('auth-title');
  const submit = document.getElementById('auth-submit');
  const toggle = document.getElementById('auth-toggle');
  const prompt = document.getElementById('auth-prompt');
  const error = document.getElementById('auth-error');
  let mode = 'login';
  toggle.addEventListener('click', () => {
    mode = mode === 'login' ? 'signup' : 'login';
    title.textContent = mode === 'login' ? 'Log in' : 'Create account';
    submit.textContent = mode === 'login' ? 'Log in' : 'Sign up';
    prompt.textContent = mode === 'login' ? 'New here?' : 'Already have an account?';
    toggle.textContent = mode === 'login' ? 'Create an account' : 'Log in';
    error.textContent = '';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); error.textContent = '';
    try {
      await api('/api/' + mode, { method: 'POST', body: JSON.stringify({ email: form.email.value, password: form.password.value }) });
      window.location.href = '/confessions.html';
    } catch (err) { error.textContent = err.message; }
  });
}

async function initAdmin() {
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
}

document.addEventListener('DOMContentLoaded', () => {
  const pages = { confessions: initConfessions, 'my-confessions': initMyConfessions, privacy: initPrivacy, login: initAuth, admin: initAdmin };
  const init = pages[document.body.dataset.page];
  if (init) init();
});
