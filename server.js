const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase(); // reviewer account
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || '').toLowerCase(); // e.g. "adc.edu.in" (optional)
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const SECRET_FILE = path.join(__dirname, 'data', 'secret.key');

if (!fs.existsSync(path.dirname(DB_FILE))) fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'));
  SECRET = fs.readFileSync(SECRET_FILE, 'utf8');
}

const db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : { users: [], posts: [], drafts: {} };
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db));
const emailKey = (e) => crypto.createHash('sha256').update(e.trim().toLowerCase()).digest('hex');

const ADMIN_KEY = ADMIN_EMAIL ? emailKey(ADMIN_EMAIL) : null;
const app = express();
app.use(express.json({ limit: '5mb' }));

const readCookie = (req, name) => {
  const m = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
};
const auth = (req, res, next) => {
  try { req.uid = jwt.verify(readCookie(req, 'token'), SECRET).uid; next(); }
  catch { res.status(401).json({ error: 'Please log in.' }); }
};
const setToken = (res, uid) => {
  const t = jwt.sign({ uid }, SECRET, { expiresIn: '30d' });
  res.setHeader('Set-Cookie', `token=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
};

app.post('/api/signup', (req, res) => {
  const { email = '', password = '' } = req.body;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (ALLOWED_DOMAIN && !email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN)) return res.status(400).json({ error: 'Please use your college email.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const key = emailKey(email);
  if (db.users.some((u) => u.key === key)) return res.status(409).json({ error: 'Account already exists.' });
  const user = { id: crypto.randomUUID(), key, hash: bcrypt.hashSync(password, 12) };
  db.users.push(user); save(); setToken(res, user.id); res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { email = '', password = '' } = req.body;
  const user = db.users.find((u) => u.key === emailKey(email));
  if (!user || !bcrypt.compareSync(password, user.hash)) return res.status(401).json({ error: 'Wrong email or password.' });
  setToken(res, user.id); res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0'); res.json({ ok: true });
});
const isAdmin = (uid) => { const u = db.users.find((x) => x.id === uid); return !!(u && ADMIN_KEY && u.key === ADMIN_KEY); };
const adminOnly = (req, res, next) => (isAdmin(req.uid) ? next() : res.status(403).json({ error: 'Not allowed.' }));
app.get('/api/me', auth, (req, res) => res.json({ ok: true, admin: isAdmin(req.uid) }));

// Public shape never includes author info.
const pub = (p) => ({ id: p.id, text: p.text, createdAt: p.createdAt, views: p.views });

app.get('/api/confessions', auth, (req, res) => {
  const sort = req.query.sort || 'latest';
  const terms = String(req.query.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const now = Date.now();
  let list = db.posts.filter((p) => p.status === 'approved').map((p) => {
    const days = (now - p.createdAt) / 864e5;
    const hits = terms.reduce((n, t) => n + (p.text.toLowerCase().includes(t) ? 1 : 0), 0);
    return { p, score: hits * 10 + (p.views + 1) / (days + 1), hits };
  });
  if (sort === 'relevant' && terms.length) list = list.filter((x) => x.hits > 0);
  if (sort === 'popular') list.sort((a, b) => b.p.views - a.p.views || b.p.createdAt - a.p.createdAt);
  else if (sort === 'relevant') list.sort((a, b) => b.score - a.score);
  else list.sort((a, b) => b.p.createdAt - a.p.createdAt);
  res.json(list.slice(0, 100).map((x) => pub(x.p)));
});

app.post('/api/confessions', auth, (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Write something first.' });
  db.posts.push({ id: crypto.randomUUID(), uid: req.uid, text, createdAt: Date.now(), views: 0, status: 'pending' });
  delete db.drafts[req.uid]; save(); res.json({ ok: true });
});

app.post('/api/confessions/:id/view', auth, (req, res) => {
  const p = db.posts.find((x) => x.id === req.params.id);
  if (p && p.status === 'approved' && p.uid !== req.uid) { p.views++; save(); }
  res.json({ ok: true });
});

app.get('/api/my', auth, (req, res) => {
  const mine = db.posts.filter((p) => p.uid === req.uid).sort((a, b) => b.createdAt - a.createdAt).map((p) => ({ ...pub(p), status: p.status }));
  res.json({ posts: mine, draft: db.drafts[req.uid] || null });
});
// Reviewer endpoints: never expose author ids.
app.get('/api/admin/pending', auth, adminOnly, (req, res) => {
  res.json(db.posts.filter((p) => p.status === 'pending').sort((a, b) => a.createdAt - b.createdAt).map(pub));
});
app.put('/api/admin/posts/:id', auth, adminOnly, (req, res) => {
  const p = db.posts.find((x) => x.id === req.params.id && x.status === 'pending');
  if (!p) return res.status(404).json({ error: 'Post not found.' });
  const { action, text } = req.body;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action.' });
  if (action === 'approve') {
    const edited = String(text || '').trim();
    if (!edited) return res.status(400).json({ error: 'Text cannot be empty.' });
    if (edited !== p.text) { p.original = p.original || p.text; p.text = edited; p.edited = true; }
    p.status = 'approved'; p.approvedAt = Date.now();
  } else p.status = 'rejected';
  save(); res.json({ ok: true });
});

app.get('/api/draft', auth, (req, res) => res.json({ draft: db.drafts[req.uid] || null }));
app.put('/api/draft', auth, (req, res) => {
  const text = String(req.body.text || '');
  if (text.trim()) db.drafts[req.uid] = { text, updatedAt: Date.now() }; else delete db.drafts[req.uid];
  save(); res.json({ ok: true });
});

app.get('/', (req, res) => res.redirect('/confessions.html'));
app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => console.log(`unspokenadc running on http://localhost:${PORT}`));
