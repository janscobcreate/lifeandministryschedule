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

const meetingRules = require('../public/meeting-rules');
const { publicWeek } = require('../server');

test('Thursday is the meeting date within the Monday-to-Sunday programme week', () => {
  assert.equal(meetingRules.thursdayFor('2026-11-16'), '2026-11-19');
  assert.equal(meetingRules.thursdayFor('2026-12-28'), '2026-12-31');
});

test('existing weeks without a meeting type remain regular and editable', () => {
  const old = seedWeek('2026-11-16');
  delete old.weekType; delete old.memorialTiming; delete old.coTalk;
  const updated = normaliseWeek(old, '2026-11-16');
  assert.equal(updated.weekType, 'regular');
  assert.equal(updated.memorialTiming, 'weekday');
  assert.equal(updated.living.at(-1).type, 'study');
  assert.equal(meetingRules.hasThursdayMeeting(updated), true);
});

test('CO visit replaces the Bible Study with an editable CO talk but preserves underlying study data', () => {
  const week = seedWeek('2026-11-16');
  week.weekType = 'co_visit';
  week.living.at(-1).conductor = 'Existing Bible Study Conductor';
  week.living.at(-1).reader = 'Existing Bible Study Reader';
  week.coTalk.assignee = 'Circuit Overseer';
  week.coTalk.topic = 'Talk theme';
  week.coTalk.minutes = 30;
  const saved = normaliseWeek(week, '2026-11-16');
  assert.equal(saved.living.at(-1).conductor, 'Existing Bible Study Conductor');
  const visible = meetingRules.visibleLiving(saved);
  assert.equal(visible.at(-1).type, 'co_talk');
  assert.equal(visible.at(-1).assignee, 'Circuit Overseer');
  assert.equal(visible.at(-1).minutes, 30);
  assert.equal(visible.some((p) => p.type === 'study'), false);
  const publiclyVisible = publicWeek(saved);
  assert.equal(publiclyVisible.living.some((p) => p.type === 'study'), false);
  assert.doesNotMatch(JSON.stringify(publiclyVisible), /Existing Bible Study Reader/);
});

test('assembly and convention weeks have no Thursday assignments in the public response', () => {
  for (const type of ['circuit_assembly', 'convention']) {
    const week = seedWeek('2026-11-16');
    week.weekType = type;
    week.chairman = 'Existing Chairman';
    week.treasures[0].assignee = 'Existing Assignee';
    const saved = normaliseWeek(week, '2026-11-16');
    assert.equal(meetingRules.hasThursdayMeeting(saved), false);
    assert.equal(saved.treasures[0].assignee, 'Existing Assignee');
    const publicView = publicWeek(saved);
    assert.equal(publicView.chairman, '');
    assert.equal(publicView.treasures.length, 0);
    assert.equal(publicView.ministry.length, 0);
    assert.equal(publicView.living.length, 0);
    assert.equal(publicView.coTalk, null);
  }
});

test('weekday Memorial cancels Thursday; weekend Memorial retains Thursday assignments', () => {
  const week = seedWeek('2026-11-16');
  week.weekType = 'memorial';
  week.memorialTiming = 'weekday';
  let saved = normaliseWeek(week, '2026-11-16');
  assert.equal(meetingRules.hasThursdayMeeting(saved), false);
  assert.equal(publicWeek(saved).treasures.length, 0);
  week.memorialTiming = 'weekend';
  saved = normaliseWeek(week, '2026-11-16');
  assert.equal(meetingRules.hasThursdayMeeting(saved), true);
  assert.equal(publicWeek(saved).treasures.length, 3);
  assert.match(meetingRules.specialNotice(saved), /No weekend meeting/);
});

test('invalid special meeting choices are rejected', () => {
  const week = seedWeek('2026-11-16');
  week.weekType = 'other';
  assert.throws(() => normaliseWeek(week, '2026-11-16'), /Unknown week type/);
  week.weekType = 'memorial';
  week.memorialTiming = 'sunday-only';
  assert.throws(() => normaliseWeek(week, '2026-11-16'), /Invalid Memorial timing/);
});

test('public regular weeks do not expose CO-only speaker details', () => {
  const week = seedWeek('2026-11-16');
  week.coTalk.assignee = 'Unpublished CO Speaker';
  const publicRecord = publicWeek(normaliseWeek(week, '2026-11-16'));
  assert.equal(publicRecord.coTalk, null);
  assert.doesNotMatch(JSON.stringify(publicRecord), /Unpublished CO Speaker/);
});

test('meeting-rules.js is served so the public and admin browser views can use special-week rules', async (t) => {
  const { makeServer } = require('../server');
  const server = makeServer().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/meeting-rules.js?v=3`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /hasThursdayMeeting/);
});
