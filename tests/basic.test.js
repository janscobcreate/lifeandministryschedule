'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { seedWeek, mondayFor, formatLocalISODate } = require('../store');
const { normaliseWeek, isValidMonday } = require('../server');

test('week beginning November 16, 2026 is recognised correctly', () => {
  assert.equal(mondayFor('2026-11-17'), '2026-11-16');
  assert.equal(mondayFor('2026-11-22'), '2026-11-16');
  assert.equal(mondayFor('2026-11-23'), '2026-11-23');
  assert.equal(isValidMonday('2026-11-16'), true);
  assert.equal(isValidMonday('2026-11-17'), false);
  assert.equal(isValidMonday('2026-02-30'), false);
});
test('seeds the standard three sections and permanent Bible study assignment', () => {
  const week = seedWeek('2026-11-16');
  assert.equal(week.chairman, '');
  assert.deepEqual(week.treasures.map((p) => p.minutes), [10, 10, 5]);
  assert.deepEqual(week.treasures.map((p) => p.number), ['1', '2', '3']);
  assert.equal(week.ministry.length, 3);
  assert.equal(week.ministry[0].assistant, '');
  assert.equal(week.living.at(-1).type, 'study');
  assert.equal(week.living.at(-1).title, 'Congregation Bible Study');
  assert.equal(week.living.at(-1).reader, '');
  assert.equal(week.living.at(-1).conductor, '');
});
test('allows adjustable field ministry and Christian living parts', () => {
  const week = seedWeek('2026-11-16');
  week.ministry.push({ id:'extra', number:'7',title:'Follow-up Visit',minutes:4,assignee:'A',assistant:'B' });
  week.living.splice(-1,0,{ id:'extra2',number:'8',title:'Local Needs',minutes:12,assignee:'Speaker' });
  week.living.at(-1).number = '9';
  week.published = true;
  const updated = normaliseWeek(week,'2026-11-16');
  assert.equal(updated.ministry.length,4);
  assert.equal(updated.living.length,3);
  assert.equal(updated.ministry.at(-1).assistant,'B');
  assert.equal(updated.living.at(-1).type,'study');
  assert.equal(updated.published, true);
});
test('cannot remove the final Congregation Bible Study', () => {
  const week = seedWeek('2026-11-16');
  week.living.pop();
  assert.throws(() => normaliseWeek(week,'2026-11-16'),/Bible Study must be the final assignment/);
});
test('input cleansing trims, limits strings, and restricts durations', () => {
  const week = seedWeek('2026-11-16');
  week.chairman = ' X '.repeat(100);
  week.ministry[0].minutes = 999;
  const clean = normaliseWeek(week,'2026-11-16');
  assert.equal(clean.chairman.length,160);
  assert.equal(clean.ministry[0].minutes,5);
});
test('date is formatted in Lagos timezone', () => {
  assert.match(formatLocalISODate(new Date('2026-11-16T23:30:00Z')), /^2026-11-17$/);
});

test('public and admin URLs both serve the app, without exposing a dashboard at the root', async (t) => {
  const { makeServer } = require('../server');
  const server = makeServer().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const [publicRes, adminRes, stylesheet] = await Promise.all([
    fetch(`${base}/`), fetch(`${base}/admin`), fetch(`${base}/styles.css?v=2`)
  ]);
  assert.equal(publicRes.status, 200);
  assert.equal(adminRes.status, 200);
  assert.equal(stylesheet.status, 200);
  assert.match(await publicRes.text(), /Life and Ministry Schedule/);
  assert.match(await adminRes.text(), /Administrator access/);
  assert.match(await stylesheet.text(), /public-view \.person-name/);
});
