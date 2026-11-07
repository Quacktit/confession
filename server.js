const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3000;
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || '').toLowerCase(); // e.g. "adc.edu.in" (optional)
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const SECRET_FILE = path.join(__dirname, 'data', 'secret.key');

if (!fs.existsSync(path.dirname(DB_FILE))) fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'));
  SECRET = fs.readFileSync(SECRET_FILE, 'utf8');
}

let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : { users: [], posts: [], drafts: {} };
let mongoCollection = null;

if (process.env.MONGO_URI) {
  const client = new MongoClient(process.env.MONGO_URI);
  client.connect().then(async () => {
    mongoCollection = client.db('unspokenadc').collection('app_state');
    const cloudData = await mongoCollection.findOne({ _id: 'main_db' });
    if (cloudData) {
      db.users = cloudData.users || [];
      db.posts = cloudData.posts || [];
      db.drafts = cloudData.drafts || {};
    } else {
      await mongoCollection.insertOne({ _id: 'main_db', ...db });
    }
    console.log('Connected to MongoDB Cloud Storage');
  }).catch(err => console.error('MongoDB Error:', err));
}

const save = () => {
  fs.writeFileSync(DB_FILE, JSON.stringify(db));
  if (mongoCollection) {
    mongoCollection.updateOne(
      { _id: 'main_db' },
      { $set: { users: db.users, posts: db.posts, drafts: db.drafts } },
      { upsert: true }
    ).catch(err => console.error('Save Error:', err));
  }
};
const emailKey = (e) => crypto.createHash('sha256').update(e.trim().toLowerCase()).digest('hex');
const SECURE = process.env.RENDER || process.env.NODE_ENV === 'production' ? '; Secure' : '';
const EKEY = process.env.EMAIL_ENC_KEY ? Buffer.from(process.env.EMAIL_ENC_KEY, 'hex') : null;
const enc = (s) => {
  if (!EKEY) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', EKEY, iv);
  const d = Buffer.concat([c.update(s, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), d].map((b) => b.toString('base64')).join('.');
};
const dec = (s) => {
  if (!EKEY || !s) return null;
  try {
    const [iv, tag, d] = s.split('.').map((x) => Buffer.from(x, 'base64'));
    const c = crypto.createDecipheriv('aes-256-gcm', EKEY, iv);
    c.setAuthTag(tag);
    return Buffer.concat([c.update(d), c.final()]).toString('utf8');
  } catch { return null; }
};
db.users.forEach((u) => { if (u.email) { if (EKEY) u.emailEnc = enc(u.email); delete u.email; } });
save();

const hits = new Map();
const limit = (max, windowMs) => (req, res, next) => {
  const k = req.originalUrl.split('?')[0] + '|' + req.ip, now = Date.now();
  const h = (hits.get(k) || []).filter((t) => now - t < windowMs);
  if (h.length >= max) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  h.push(now); hits.set(k, h); next();
};
setInterval(() => hits.clear(), 60 * 60 * 1000);

const adminFails = new Map();
const adminOnly = (req, res, next) => {
  const now = Date.now();
  const f = (adminFails.get(req.ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (f.length >= 5) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  const real = process.env.ADMIN_KEY || '';
  const a = crypto.createHash('sha256').update(String(req.headers['x-admin-key'] || '')).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  if (real.length < 20 || !crypto.timingSafeEqual(a, b)) {
    f.push(now); adminFails.set(req.ip, f);
    return res.status(403).json({ error: 'Wrong admin key.' });
  }
  next();
};

const app = express();
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.json({ limit: '1mb' }));

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
    res.setHeader('Set-Cookie', `token=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${SECURE}`);
};

app.use(['/api/login', '/api/signup', '/api/forgot', '/api/reset'], limit(10, 15 * 60 * 1000));
app.post('/api/signup', (req, res) => {
  const { email = '', password = '' } = req.body;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (ALLOWED_DOMAIN && !email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN)) return res.status(400).json({ error: 'Please use your college email.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const key = emailKey(email);
  if (db.users.some((u) => u.key === key)) return res.status(409).json({ error: 'Account already exists.' });
  const user = { id: crypto.randomUUID(), key, emailEnc: enc(email.trim().toLowerCase()), hash: bcrypt.hashSync(password, 12) };
  db.users.push(user); save(); setToken(res, user.id); res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { email = '', password = '' } = req.body;
  const user = db.users.find((u) => u.key === emailKey(email));
  if (!user || !bcrypt.compareSync(password, user.hash)) return res.status(401).json({ error: 'Wrong email or password.' });
  if (!user.emailEnc && EKEY) { user.emailEnc = enc(email.trim().toLowerCase()); save(); }
  setToken(res, user.id); res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0'); res.json({ ok: true });
});

app.put('/api/confessions/:id', auth, (req, res) => {
  const p = db.posts.find((x) => x.id === req.params.id && x.uid === req.uid);
  if (!p) return res.status(404).json({ error: 'Post not found.' });
  if (p.status === 'private') return res.status(403).json({ error: 'This post was hidden by the site reviewer.' });
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Write something first.' });
  if (text === p.text) return res.json({ ok: true, changed: false });
  p.original = p.original || p.text;
  p.text = text; p.edited = true; p.status = 'pending';
  save(); res.json({ ok: true, changed: true });
});



app.put('/api/admin/posts/:id/update', adminOnly, (req, res) => {
  const p = db.posts.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Post not found.' });
  const { text, status } = req.body;
  if (text !== undefined) {
    const t = String(text).trim();
    if (!t) return res.status(400).json({ error: 'Text cannot be empty.' });
    if (t !== p.text) { p.original = p.original || p.text; p.text = t; p.edited = true; }
  }
  if (status !== undefined) {
    if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    p.status = status;
  }
 save(); res.json({ email: (u && dec(u.emailEnc)) || null });
});
app.delete('/api/admin/posts/:id', adminOnly, (req, res) => {
  const i = db.posts.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Post not found.' });
  db.posts.splice(i, 1); save(); res.json({ ok: true });
});
app.get('/api/admin/posts/:id/author', adminOnly, (req, res) => {
  const p = db.posts.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Post not found.' });
  const u = db.users.find((x) => x.id === p.uid);
  db.audit.push({ at: Date.now(), postId: p.id });
  save(); res.json({ email: (u && u.email) || null });
});

app.get('/api/me', auth, (req, res) => res.json({ ok: true }));

// Public shape never includes author info.
const pub = (p) => ({ id: p.id, text: p.text, createdAt: p.createdAt, views: p.views });

app.get('/api/confessions/:id', auth, (req, res) => {
  const p = db.posts.find((x) => x.id === req.params.id);
  if (!p || (p.status !== 'approved' && p.uid !== req.uid)) return res.status(404).json({ error: 'Confession not found.' });
  res.json(pub(p));
});
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
app.get('/api/admin/pending', adminOnly, (req, res) => {
  res.json(db.posts.filter((p) => p.status === 'pending').sort((a, b) => a.createdAt - b.createdAt).map(pub));
});
app.put('/api/admin/posts/:id', adminOnly, (req, res) => {
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
