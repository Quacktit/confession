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
           card.addEventListener('click', () => { window.location.href = '/confession.html?id=' + post.id; });
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
  const notice = document.getElementById('my-notice');

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function draftCard(d) {
    const c = el('article', 'card draft');
    const m = el('div', 'card-meta');
    const a = el('a', '', 'Continue writing → '); a.href = '/confessions.html';
    m.append(a, document.createTextNode('Autosaved ' + formatDate(d.updatedAt)));
    c.append(el('span', 'badge', 'DRAFT'), el('p', 'card-text', d.text), m);
    return c;
  }

  function startEdit(textEl, post) {
    const ta = el('textarea', 'review-text'); ta.value = post.text;
    const warn = el('p', 'review-note', 'Saving sends this post back for review before it appears publicly.');
    const row = el('div', 'review-actions');
    const save = el('button', 'btn', 'Save changes'); save.type = 'button';
    const cancel = el('button', 'btn btn-reject', 'Cancel'); cancel.type = 'button';
    row.append(save, cancel);
    textEl.replaceWith(ta);
    ta.after(warn, row);
    cancel.addEventListener('click', load);
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const res = await api('/api/confessions/' + post.id, { method: 'PUT', body: JSON.stringify({ text: ta.value }) });
        if (res.changed) { notice.textContent = 'Your post was updated and is being reviewed before it is published.'; notice.hidden = false; }
        load();
      } catch (e) { alert(e.message); save.disabled = false; }
    });
  }

    function postCard(post) {
    const c = el('article', 'card');
    const top = el('div', 'card-top');
    const label = post.status === 'pending' ? 'IN REVIEW' : post.status === 'rejected' ? 'NOT PUBLISHED' : post.status === 'private' ? 'HIDDEN' : '';    top.append(label ? el('span', 'badge', label) : el('span'));
    const editBtn = el('button', 'btn btn-sm', 'Edit'); editBtn.type = 'button';
    if (post.status !== 'private') top.append(editBtn);
    const text = el('p', 'card-text', post.text);
    c.append(top, text, el('div', 'card-meta', formatDate(post.createdAt)));
    if (post.status === 'pending') c.append(el('p', 'review-note', 'This post is being reviewed before it is published.'));
    if (post.status === 'rejected') c.append(el('p', 'review-note', 'This post was not published. Edit it and it will be reviewed again.'));
    if (post.status === 'private') c.append(el('p', 'review-note', 'This post was hidden by the site reviewer.'));
      editBtn.addEventListener('click', () => { editBtn.hidden = true; startEdit(text, post); });
    return c;
  }
  
  async function load() {
    const { posts, draft } = await api('/api/my');
    list.replaceChildren();
    if (draft) list.append(draftCard(draft));
    posts.forEach((p) => list.append(postCard(p)));
    if (!draft && !posts.length) list.append(el('p', 'empty', 'You have not shared anything yet.'));
  }

  await load();
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

async function adminApi(url, options = {}) {
  return api(url, { ...options, headers: { 'Content-Type': 'application/json', 'x-admin-key': sessionStorage.getItem('adminKey') || '' } });
}

async function initAdmin() {
  bindLogout();
  const gate = document.getElementById('gate');
  const gateForm = document.getElementById('gate-form');
  const gateMsg = document.getElementById('gate-msg');
  const panel = document.getElementById('panel');
  const queue = document.getElementById('queue');
  const all = document.getElementById('all-posts');
  const filter = document.getElementById('status-filter');
  const sortBtn = document.getElementById('sort-btn');
  let newest = true;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function btn(row, label, cls, fn) {
    const b = el('button', cls, label); b.type = 'button';
    b.addEventListener('click', fn); row.append(b); return b;
  }
  async function run(fn) { try { await fn(); await refresh(); } catch (e) { alert(e.message); } }

  function queueCard(post) {
    const c = el('article', 'review-card');
    const ta = el('textarea', 'review-text'); ta.value = post.text;
    const row = el('div', 'review-actions');
    btn(row, 'Approve & publish', 'btn', () => run(() => adminApi('/api/admin/posts/' + post.id, { method: 'PUT', body: JSON.stringify({ action: 'approve', text: ta.value }) })));
    btn(row, 'Reject', 'btn btn-reject', () => run(() => adminApi('/api/admin/posts/' + post.id, { method: 'PUT', body: JSON.stringify({ action: 'reject' }) })));
    c.append(el('div', 'muted', formatDate(post.createdAt)), ta, row);
    return c;
  }

  function allCard(post) {
    const c = el('article', 'review-card');
    const head = el('div', 'admin-top');
    head.append(el('span', 'badge', post.status.toUpperCase()), el('span', 'muted', formatDate(post.createdAt) + ' · ' + post.views + ' reads'));
    const ta = el('textarea', 'review-text'); ta.value = post.text;
    const row = el('div', 'review-actions');
    const info = el('p', 'review-note');
    const update = (body) => run(() => adminApi('/api/admin/posts/' + post.id + '/update', { method: 'PUT', body: JSON.stringify(body) }));
    const sel = el('select', 'search');
    [['approved', 'Published'], ['pending', 'In review'], ['private', 'Private'], ['rejected', 'Rejected']].forEach(([v, t]) => {
      const o = el('option', '', t); o.value = v; if (v === post.status) o.selected = true; sel.append(o);
    });
    sel.addEventListener('change', () => update({ text: ta.value, status: sel.value }));
    row.append(sel);
    btn(row, 'Save text', 'btn', () => update({ text: ta.value }));
    btn(row, 'Delete', 'btn btn-reject', () => { if (confirm('Delete this post permanently?')) run(() => adminApi('/api/admin/posts/' + post.id, { method: 'DELETE' })); });
    btn(row, 'Reveal author', 'btn btn-reject', async () => {
      if (!confirm('Reveal the author email for this post? This action is logged.')) return;
      try {
        const r = await adminApi('/api/admin/posts/' + post.id + '/author');
        info.textContent = r.email ? 'Author: ' + r.email : 'Email not available for this account.';
      } catch (e) { alert(e.message); }
    });
    c.append(head, ta, row, info);
    return c;
  }

  async function refresh() {
    const pending = await adminApi('/api/admin/pending');
    const s = filter.value;
    const posts = await adminApi('/api/admin/posts' + (s ? '?status=' + s : ''));
    posts.sort((a, b) => newest ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
    queue.replaceChildren(); all.replaceChildren();
    pending.forEach((p) => queue.append(queueCard(p)));
    if (!pending.length) queue.append(el('p', 'muted', 'No posts waiting for review.'));
    posts.forEach((p) => all.append(allCard(p)));
    if (!posts.length) all.append(el('p', 'muted', 'No posts here.'));
  }

  async function unlock(key) {
    sessionStorage.setItem('adminKey', key);
    try { await refresh(); gate.hidden = true; panel.hidden = false; }
    catch (e) { sessionStorage.removeItem('adminKey'); gateMsg.textContent = e.message; }
  }

  filter.addEventListener('change', () => run(async () => {}));
  sortBtn.addEventListener('click', () => {
    newest = !newest;
    sortBtn.textContent = newest ? 'Newest first ↓' : 'Oldest first ↑';
    run(async () => {});
  });
  gateForm.addEventListener('submit', (e) => {
    e.preventDefault(); gateMsg.textContent = '';
    unlock(gateForm.key.value); gateForm.key.value = '';
  });
  if (sessionStorage.getItem('adminKey')) unlock(sessionStorage.getItem('adminKey'));
}

async function initConfession() {
  await requireAuth();
  bindLogout();
  const id = new URLSearchParams(window.location.search).get('id');
  const text = document.getElementById('read-text');
  const meta = document.getElementById('read-meta');
  try {
    const post = await api('/api/confessions/' + encodeURIComponent(id));
    text.textContent = post.text;
    meta.textContent = formatDate(post.createdAt);
    api('/api/confessions/' + post.id + '/view', { method: 'POST' }).catch(() => {});
  } catch (e) { text.textContent = e.message; }
}

function addPasswordToggles() {
  const attrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const eye = '<svg ' + attrs + '><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOff = '<svg ' + attrs + '><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-7 0-11-7-11-7a19.8 19.8 0 0 1 5.06-5.94M9.9 4.24A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a19.9 19.9 0 0 1-3.17 4.19M1 1l22 22"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>';
  document.querySelectorAll('input[type="password"]').forEach((input) => {
    const wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.append(input);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pw-toggle';
    b.setAttribute('aria-label', 'Show password');
    b.innerHTML = eye;
    b.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.innerHTML = show ? eyeOff : eye;
      b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    wrap.append(b);
  });
}

document.addEventListener('DOMContentLoaded', () => {
 const pages = { confessions: initConfessions, confession: initConfession, 'my-confessions': initMyConfessions, privacy: initPrivacy, login: initAuth, admin: initAdmin };
  const init = pages[document.body.dataset.page];
  if (init) init();
  document.addEventListener('DOMContentLoaded', () => {
  addPasswordToggles();
  const pages = { ... };   // leave the rest exactly as it is
});
