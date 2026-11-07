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
    const label = post.status === 'pending' ? 'IN REVIEW' : post.status === 'rejected' ? 'NOT PUBLISHED' : '';
    top.append(label ? el('span', 'badge', label) : el('span'));
    const wrap = el('div', 'menu-wrap');
    const dots = el('button', 'dots-btn', '⋮'); dots.type = 'button'; dots.setAttribute('aria-label', 'Post options');
    const menu = el('div', 'menu');
    const editBtn = el('button', 'menu-item', 'Edit'); editBtn.type = 'button';
    menu.append(editBtn); wrap.append(dots, menu); top.append(wrap);
    const text = el('p', 'card-text', post.text);
    c.append(top, text, el('div', 'card-meta', formatDate(post.createdAt)));
    if (post.status === 'pending') c.append(el('p', 'review-note', 'This post is being reviewed before it is published.'));
    if (post.status === 'rejected') c.append(el('p', 'review-note', 'This post was not published. Edit it and it will be reviewed again.'));
    dots.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.menu-wrap.open').forEach((w) => { if (w !== wrap) w.classList.remove('open'); });
      wrap.classList.toggle('open');
    });
    editBtn.addEventListener('click', () => { wrap.classList.remove('open'); startEdit(text, post); });
    return c;
  }

  async function load() {
    const { posts, draft } = await api('/api/my');
    list.replaceChildren();
    if (draft) list.append(draftCard(draft));
    posts.forEach((p) => list.append(postCard(p)));
    if (!draft && !posts.length) list.append(el('p', 'empty', 'You have not shared anything yet.'));
  }

  document.addEventListener('click', () => document.querySelectorAll('.menu-wrap.open').forEach((w) => w.classList.remove('open')));
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

document.addEventListener('DOMContentLoaded', () => {
 const pages = { confessions: initConfessions, confession: initConfession, 'my-confessions': initMyConfessions, privacy: initPrivacy, login: initAuth, admin: initAdmin };
  const init = pages[document.body.dataset.page];
  if (init) init();
});
