'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE_PATH = path.join(__dirname, 'data', 'schedule.json');
const ZONE = 'Africa/Lagos';
let pool;
let initialised = false;
let lastSeededWeek = null;
let fileQueue = Promise.resolve();

function formatLocalISODate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: ZONE
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function mondayFor(dateISO) {
  const date = new Date(`${dateISO}T12:00:00Z`);
  const delta = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - delta);
  return date.toISOString().slice(0, 10);
}
function advanceISO(start, days) {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function newId() { return crypto.randomUUID(); }
function seedWeek(weekStart) {
  return {
    weekStart,
    published: false,
    chairman: '',
    treasures: [
      { id: 'talk', number: '1', title: '10-Minute Talk', topic: '', minutes: 10, assignee: '' },
      { id: 'gems', number: '2', title: 'Spiritual Gems', topic: '', minutes: 10, assignee: '' },
      { id: 'reading', number: '3', title: 'Bible Reading', topic: '', minutes: 5, assignee: '' }
    ],
    ministry: [
      { id: newId(), number: '4', title: 'Field Ministry Assignment', topic: '', minutes: 3, assignee: '', assistant: '' },
      { id: newId(), number: '5', title: 'Field Ministry Assignment', topic: '', minutes: 4, assignee: '', assistant: '' },
      { id: newId(), number: '6', title: 'Field Ministry Assignment', topic: '', minutes: 5, assignee: '', assistant: '' }
    ],
    living: [
      { id: newId(), number: '7', title: 'Living as Christians', topic: '', minutes: 15, assignee: '' },
      { id: 'study', type: 'study', number: '8', title: 'Congregation Bible Study', topic: '', minutes: 30, conductor: '', reader: '' }
    ],
    updatedAt: null
  };
}

async function readFile() {
  try {
    const content = JSON.parse(await fs.readFile(FILE_PATH, 'utf8'));
    return Array.isArray(content.weeks) ? content.weeks : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
async function atomicFileWrite(weeks) {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  const tmp = `${FILE_PATH}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify({ weeks }, null, 2), { mode: 0o600 });
    await fs.rename(tmp, FILE_PATH);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}
function fileTransaction(transform) {
  const task = fileQueue.then(async () => {
    const weeks = await readFile();
    const outcome = await transform(weeks);
    if (outcome.write) await atomicFileWrite(weeks);
    return outcome.result;
  });
  fileQueue = task.catch(() => {});
  return task;
}

async function initStore() {
  if (initialised) return;
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 15000 });
    await pool.query(`CREATE TABLE IF NOT EXISTS life_ministry_weeks (
      week_start DATE PRIMARY KEY,
      payload JSONB NOT NULL,
      published BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    console.log('Storage: PostgreSQL');
  } else {
    await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
    console.log('Storage: local JSON file (development only; use PostgreSQL for hosting)');
  }
  initialised = true;
  await ensureWeeks();
}
async function ensureWeeks() {
  const current = mondayFor(formatLocalISODate());
  if (lastSeededWeek === current) return current;
  const desired = Array.from({ length: 12 }, (_, i) => advanceISO(current, i * 7));
  if (pool) {
    for (const date of desired) {
      const week = seedWeek(date);
      await pool.query(`INSERT INTO life_ministry_weeks (week_start, payload, published)
        VALUES ($1::date, $2::jsonb, false) ON CONFLICT (week_start) DO NOTHING`, [date, JSON.stringify(week)]);
    }
  } else {
    await fileTransaction((weeks) => {
      const known = new Set(weeks.map((w) => w.weekStart));
      let write = false;
      for (const date of desired) {
        if (!known.has(date)) { weeks.push(seedWeek(date)); write = true; }
      }
      return { write, result: null };
    });
  }
  lastSeededWeek = current;
  return current;
}
async function allWeeks() {
  await ensureWeeks();
  if (pool) {
    const { rows } = await pool.query(`SELECT to_char(week_start, 'YYYY-MM-DD') AS date,
      payload, published, updated_at FROM life_ministry_weeks ORDER BY week_start ASC`);
    return rows.map((r) => ({ ...r.payload, weekStart: r.date, published: r.published, updatedAt: r.updated_at }));
  }
  return (await fileTransaction(async (weeks) => ({ write: false, result: weeks })))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
async function saveWeek(week) {
  const now = new Date().toISOString();
  const saved = { ...week, updatedAt: now };
  if (pool) {
    await pool.query(`INSERT INTO life_ministry_weeks (week_start, payload, published, updated_at)
      VALUES ($1::date, $2::jsonb, $3, NOW())
      ON CONFLICT (week_start) DO UPDATE SET
        payload = EXCLUDED.payload, published = EXCLUDED.published, updated_at = NOW()`,
    [week.weekStart, JSON.stringify(saved), week.published]);
  } else {
    await fileTransaction((weeks) => {
      const i = weeks.findIndex((w) => w.weekStart === week.weekStart);
      if (i < 0) weeks.push(saved); else weeks[i] = saved;
      return { write: true, result: null };
    });
  }
  return saved;
}
async function createNextWeek() {
  const weeks = await allWeeks();
  const last = weeks.at(-1)?.weekStart || mondayFor(formatLocalISODate());
  const next = advanceISO(last, 7);
  return saveWeek(seedWeek(next));
}
module.exports = { initStore, ensureWeeks, allWeeks, saveWeek, createNextWeek, seedWeek, mondayFor, formatLocalISODate };
