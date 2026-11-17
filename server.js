'use strict';
// Dependency-free HTTP server. Optional PostgreSQL support lives in store.js.
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const store = require('./store');
const meetingRules = require('./public/meeting-rules');

if (fs.existsSync(path.join(__dirname, '.env')) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(path.join(__dirname, '.env'));
}
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const password = process.env.ADMIN_PASSWORD || '';
const secret = process.env.SESSION_SECRET || '';
const COOKIE_NAME = 'lm_admin';
const SESSION_LIFETIME = 12 * 60 * 60 * 1000;
const attempts = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function signature(message) { return crypto.createHmac('sha256', secret).update(message).digest('base64url'); }
function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function cookieFor(name, value, maxAge, req) {
  const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAge / 1000)}${secure ? '; Secure' : ''}`;
}
function isAdmin(req) {
  if (!secret || !password) return false;
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map((entry) => {
    const i = entry.indexOf('=');
    return i >= 0 ? [entry.slice(0, i).trim(), entry.slice(i + 1).trim()] : ['', ''];
  }));
  const token = cookies[COOKIE_NAME];
  if (!token) return false;
  const [data, sig] = token.split('.');
  if (!data || !sig || !safeEqual(signature(data), sig)) return false;
  try {
    const session = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return session.role === 'admin' && Number.isFinite(session.exp) && session.exp > Date.now();
  } catch { return false; }
}
function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(payload));
}
function errorJson(res, status, error) { sendJson(res, status, { error }); }
async function readJson(req) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    const e = new Error('JSON request required.'); e.httpStatus = 415; throw e;
  }
  let total = 0; const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 150 * 1024) { const e = new Error('Request is too large.'); e.httpStatus = 413; throw e; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { const e = new Error('Invalid JSON.'); e.httpStatus = 400; throw e; }
}
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  try {
    if (new URL(origin).host === req.headers.host) return;
  } catch { /* Bad origin. */ }
  const e = new Error('Invalid request origin.'); e.httpStatus = 403; throw e;
}
function cleaned(value, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function minutes(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 240 ? Math.round(n) : fallback;
}
function normalisePart(part, kind, i) {
  const p = part && typeof part === 'object' ? part : {};
  const base = { id: cleaned(p.id, 90) || crypto.randomUUID(), number: cleaned(p.number, 15),
    title: cleaned(p.title, 120), topic: cleaned(p.topic, 250), minutes: minutes(p.minutes, 5) };
  if (kind === 'study') return { ...base, id: 'study', type: 'study', title: 'Congregation Bible Study', conductor: cleaned(p.conductor), reader: cleaned(p.reader) };
  if (kind === 'ministry') return { ...base, assignee: cleaned(p.assignee), assistant: cleaned(p.assistant) };
  if (kind === 'treasures') return { ...base, id: ['talk', 'gems', 'reading'][i], assignee: cleaned(p.assignee) };
  return { ...base, assignee: cleaned(p.assignee) };
}
function normaliseWeek(input, weekStart) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid week data.');
  if (!Array.isArray(input.treasures) || input.treasures.length !== 3) throw new Error('The Treasures section must have three assignments.');
  if (!Array.isArray(input.ministry) || input.ministry.length > 12) throw new Error('Up to 12 field ministry assignments are supported.');
  if (!Array.isArray(input.living) || input.living.length < 1 || input.living.length > 12) throw new Error('The Living as Christians section needs the Bible study as its final part.');
  if (input.living.at(-1)?.type !== 'study') throw new Error('Congregation Bible Study must be the final assignment.');
  const weekType = meetingRules.typeOf(input);
  if (input.weekType !== undefined && !Object.prototype.hasOwnProperty.call(meetingRules.TYPE_LABELS, input.weekType)) throw new Error('Unknown week type.');
  if (input.memorialTiming !== undefined && !Object.prototype.hasOwnProperty.call(meetingRules.TIMING_LABELS, input.memorialTiming)) throw new Error('Invalid Memorial timing.');
  const coBase = meetingRules.defaultCOTalk(input);
  const coInput = { ...coBase, ...(input.coTalk && typeof input.coTalk === 'object' && !Array.isArray(input.coTalk) ? input.coTalk : {}) };
  const coTalk = normalisePart(coInput, 'living', 0);
  coTalk.id = 'co-talk'; coTalk.type = 'co_talk';
  coTalk.title = coTalk.title || 'First Circuit Overseer’s Talk';
  return { weekStart, published: input.published === true, chairman: cleaned(input.chairman),
    weekType, memorialTiming: meetingRules.timingOf(input), coTalk,
    treasures: input.treasures.map((p, i) => normalisePart(p, 'treasures', i)),
    ministry: input.ministry.map((p, i) => normalisePart(p, 'ministry', i)),
    living: input.living.map((p, i) => normalisePart(p, i === input.living.length - 1 ? 'study' : 'living', i)) };
}
function isValidMonday(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) &&
    new Date(`${date}T12:00:00Z`).getUTCDay() === 1 &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
}
function publicWeek(week) {
  const type = meetingRules.typeOf(week);
  if (!meetingRules.hasThursdayMeeting(week)) return {
    weekStart: week.weekStart, published: week.published, weekType: type,
    memorialTiming: meetingRules.timingOf(week), chairman: '',
    treasures: [], ministry: [], living: [], coTalk: null
  };
  if (type === 'co_visit') {
    // The Bible study names are not part of the CO programme: don't expose them publicly.
    return { ...week, living: week.living.filter((p) => p.type !== 'study'),
      coTalk: { ...meetingRules.defaultCOTalk(week), ...(week.coTalk || {}) } };
  }
  return { ...week, coTalk: null };
}
async function apiHandler(req, res, pathname) {
  const method = req.method;
  if (method === 'GET' && pathname === '/api/bootstrap') {
    const current = await store.ensureWeeks();
    const admin = isAdmin(req); const weeks = await store.allWeeks();
    return sendJson(res, 200, { authenticated: admin, adminEnabled: Boolean(password && secret), currentWeekStart: current,
      weeks: admin ? weeks : weeks.filter((w) => w.published && w.weekStart >= current).map(publicWeek) });
  }
  if (method === 'GET' && pathname === '/api/health') return sendJson(res, 200, { ok: true });
  if (!['POST', 'PUT'].includes(method)) return errorJson(res, 404, 'Unknown API endpoint.');
  checkOrigin(req);
  const body = await readJson(req);
  if (method === 'POST' && pathname === '/api/login') {
    // Limit repeated guesses by originating IP.
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const entry = attempts.get(ip) || { count: 0, start: Date.now() };
    if (Date.now() - entry.start > 15 * 60 * 1000) { entry.count = 0; entry.start = Date.now(); }
    if (entry.count >= 8) return errorJson(res, 429, 'Too many attempts. Try again in 15 minutes.');
    if (!password || !secret) return errorJson(res, 503, 'Admin credentials are not configured on the server.');
    const submitted = typeof body?.password === 'string' ? body.password : '';
    const expectedHash = crypto.createHash('sha256').update(password).digest('hex');
    const givenHash = crypto.createHash('sha256').update(submitted).digest('hex');
    if (!safeEqual(givenHash, expectedHash)) { entry.count++; attempts.set(ip, entry); return errorJson(res, 401, 'Incorrect password.'); }
    attempts.delete(ip);
    const data = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + SESSION_LIFETIME })).toString('base64url');
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieFor(COOKIE_NAME, `${data}.${signature(data)}`, SESSION_LIFETIME, req) });
  }
  if (method === 'POST' && pathname === '/api/logout') {
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieFor(COOKIE_NAME, '', 0, req) });
  }
  if (!isAdmin(req)) return errorJson(res, 401, 'Please sign in as administrator.');
  if (method === 'POST' && pathname === '/api/weeks/next') {
    return sendJson(res, 201, { week: await store.createNextWeek() });
  }
  const match = method === 'PUT' && pathname.match(/^\/api\/weeks\/(\d{4}-\d{2}-\d{2})$/);
  if (match) {
    const weekStart = match[1];
    if (!isValidMonday(weekStart)) return errorJson(res, 400, 'Week must start on a valid Monday.');
    try { return sendJson(res, 200, { week: await store.saveWeek(normaliseWeek(body, weekStart)) }); }
    catch (e) { return errorJson(res, 400, e.message || 'Invalid schedule.'); }
  }
  return errorJson(res, 404, 'Unknown API endpoint.');
}
async function staticHandler(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return errorJson(res, 405, 'Method not allowed.');
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return errorJson(res, 400, 'Invalid URL.'); }
  // The admin editor has its own URL; the shared home page stays read-only.
  if (decoded === '/' || decoded === '/admin' || decoded === '/admin/') decoded = '/index.html';
  const file = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || file.includes('\0')) return errorJson(res, 403, 'Forbidden.');
  try {
    const info = await fsp.stat(file);
    if (!info.isFile()) return errorJson(res, 404, 'Not found.');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    if (e.code === 'ENOENT') return errorJson(res, 404, 'Not found.');
    throw e;
  }
}
function makeServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname.startsWith('/api/')) return await apiHandler(req, res, pathname);
      return await staticHandler(req, res, pathname);
    } catch (e) {
      if (e.httpStatus) return errorJson(res, e.httpStatus, e.message);
      console.error('Request error:', e);
      if (!res.headersSent) errorJson(res, 500, 'Server error. Please try again.');
      else res.end();
    }
  });
}
async function start() {
  if (process.env.NODE_ENV === 'production' && (!password || !secret || secret.length < 32)) {
    throw new Error('Set ADMIN_PASSWORD and a SESSION_SECRET of at least 32 characters before deploying.');
  }
  await store.initStore();
  if (!password || !secret) console.warn('Admin login disabled. Copy .env.example to .env and configure credentials.');
  const port = Number(process.env.PORT) || 3000;
  makeServer().listen(port, '0.0.0.0', () => console.log(`Life and Ministry Schedule running on http://localhost:${port}`));
}
if (require.main === module) start().catch((err) => { console.error(err); process.exit(1); });
module.exports = { makeServer, normaliseWeek, publicWeek, isValidMonday, start };
