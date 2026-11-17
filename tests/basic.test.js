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

test('CO visit uses Tuesday within the weekly range and not Thursday', () => {
  const week = seedWeek('2026-11-16');
  week.weekType = 'co_visit';
  assert.equal(meetingRules.meetingDayOf(week), 'tuesday');
  assert.equal(meetingRules.meetingDateFor(week), '2026-11-17');
  assert.equal(meetingRules.hasMeeting(week), true);
  assert.equal(meetingRules.hasThursdayMeeting(week), false);
  assert.match(meetingRules.specialNotice(week), /Tuesday, not Thursday/);
  assert.equal(meetingRules.meetingDateFor(seedWeek('2026-11-16')), '2026-11-19');
});

test('no-meeting weeks do not have a misleading Thursday meeting date', () => {
  for (const type of ['circuit_assembly', 'convention']) {
    const week = seedWeek('2026-11-16');
    week.weekType = type;
    assert.equal(meetingRules.meetingDayOf(week), null);
    assert.equal(meetingRules.meetingDateFor(week), null);
    assert.equal(meetingRules.hasMeeting(week), false);
  }
  const memorial = seedWeek('2026-11-16');
  memorial.weekType = 'memorial';
  assert.equal(meetingRules.meetingDateFor(memorial), null);
  memorial.memorialTiming = 'weekend';
  assert.equal(meetingRules.meetingDateFor(memorial), '2026-11-19');
});

test('CO bulk Pending marks all empty roles while keeping existing names intact', () => {
  const week = seedWeek('2026-11-16');
  week.weekType = 'co_visit';
  week.treasures[0].assignee = 'Brother K.';
  week.ministry[0].assistant = 'Sister L.';
  const marked = meetingRules.markEmptyRolesPending(week);
  assert.equal(marked, 10); // chairman, two treasures, five ministry, one living, CO speaker
  assert.equal(week.chairmanPending, true);
  assert.equal(week.treasures[0].assignee, 'Brother K.');
  assert.notEqual(week.treasures[0].assigneePending, true);
  assert.equal(week.treasures[1].assigneePending, true);
  assert.equal(week.ministry[0].assistant, 'Sister L.');
  assert.notEqual(week.ministry[0].assistantPending, true);
  assert.equal(week.ministry[1].assistantPending, true);
  assert.equal(week.coTalk.assigneePending, true);
  assert.equal(week.living.at(-1).conductorPending, undefined);
  assert.equal(meetingRules.markEmptyRolesPending(week), 0); // idempotent
});

test('a CO week with Pending assignments can be published and publicly displayed', () => {
  const week = seedWeek('2026-11-16');
  week.weekType = 'co_visit';
  meetingRules.markEmptyRolesPending(week);
  week.published = true;
  const saved = normaliseWeek(week, '2026-11-16');
  const publicView = publicWeek(saved);
  assert.equal(publicView.published, true);
  assert.equal(publicView.chairmanPending, true);
  assert.ok(publicView.treasures.every((p) => p.assigneePending));
  assert.ok(publicView.ministry.every((p) => p.assigneePending && p.assistantPending));
  assert.equal(publicView.coTalk.assigneePending, true);
  assert.ok(publicView.living.every((p) => p.type !== 'study'));
  assert.equal(meetingRules.meetingDateFor(publicView), '2026-11-17');
});

test('typing a confirmed person name clears a previously Pending role on save', () => {
  const week = seedWeek('2026-11-16');
  week.weekType = 'co_visit';
  meetingRules.markEmptyRolesPending(week);
  week.chairman = 'Brother Chairman';
  week.treasures[0].assignee = 'Brother Assignee';
  week.ministry[0].assistant = 'Sister Assistant';
  week.coTalk.assignee = 'CO Speaker';
  const saved = normaliseWeek(week, '2026-11-16');
  assert.equal(saved.chairmanPending, false);
  assert.equal(saved.treasures[0].assigneePending, false);
  assert.equal(saved.ministry[0].assistantPending, false);
  assert.equal(saved.coTalk.assigneePending, false);
  assert.equal(saved.treasures[1].assigneePending, true);
  assert.equal(saved.ministry[1].assistantPending, true);
});

test('bulk Pending applies only to CO weeks and keeps regular schedules unchanged', () => {
  const regular = seedWeek('2026-11-16');
  assert.equal(meetingRules.markEmptyRolesPending(regular), 0);
  assert.equal(regular.chairmanPending, false);
  assert.equal(regular.treasures[0].assigneePending, undefined);
});

test('public browser view actually renders Tuesday and Pending in the visible programme', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const week = seedWeek('2026-11-16');
  week.weekType = 'co_visit';
  week.published = true;
  meetingRules.markEmptyRolesPending(week);
  const elements = new Map();
  const classes = { add() {}, remove() {}, toggle() {} };
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', value: '',
      classList: classes, addEventListener() {}, focus() {} });
    return elements.get(id);
  };
  const sandbox = {
    window: { location: { pathname: '/', origin: 'http://example.org' }, MeetingRules: meetingRules, scrollTo() {} },
    document: { body: { classList: classes }, getElementById, addEventListener() {} },
    Intl, Date, URL, console, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({
      authenticated: false, adminEnabled: true, weeks: [publicWeek(normaliseWeek(week, week.weekStart))],
      currentWeekStart: week.weekStart
    }) })
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8'), sandbox);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const visible = getElementById('main-content').innerHTML;
  const navigation = getElementById('week-navigation').innerHTML;
  assert.match(visible, /Tuesday, 17 November/);
  assert.match(navigation, /Tue 17 Nov/);
  assert.match(visible, /Pending/);
  assert.match(visible, /First Circuit Overseer/);
  assert.doesNotMatch(visible, /Thursday, 19 November/);
  assert.doesNotMatch(visible, /Congregation Bible Study<\/strong>/);
});

test('admin editor can toggle Pending individually even in old saved weeks without Pending fields', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const week = seedWeek('2026-11-16');
  week.weekType = 'co_visit';
  delete week.chairmanPending;
  delete week.coTalk.assigneePending;
  const elements = new Map();
  const classes = { add() {}, remove() {}, toggle() {} };
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', value: '',
      classList: classes, addEventListener() {}, focus() {} });
    return elements.get(id);
  };
  const sandbox = {
    window: { location: { pathname: '/admin', origin: 'http://example.org' }, MeetingRules: meetingRules,
      scrollTo() {}, confirm: () => true },
    document: { body: { classList: classes }, getElementById, addEventListener() {} },
    Intl, Date, URL, console, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({
      authenticated: true, adminEnabled: true, weeks: [week], currentWeekStart: week.weekStart
    }) })
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8'), ctx);
  await new Promise((resolve) => setTimeout(resolve, 10));
  vm.runInContext('startEdit()', ctx);
  assert.match(getElementById('main-content').innerHTML, /Tuesday, 17 November/);
  assert.match(getElementById('main-content').innerHTML, /Mark unassigned roles as Pending/);
  vm.runInContext(`updateEditorField({ dataset: { section: 'treasures', index: '0', field: 'assigneePending' },
    matches: () => true, type: 'checkbox', checked: true, tagName: 'INPUT' })`, ctx);
  assert.equal(vm.runInContext('state.draft.treasures[0].assigneePending', ctx), true);
  vm.runInContext(`performAction({ dataset: { action: 'mark-co-pending' } })`, ctx);
  assert.equal(vm.runInContext('state.draft.chairmanPending', ctx), true);
  assert.equal(vm.runInContext('state.draft.coTalk.assigneePending', ctx), true);
  assert.equal(vm.runInContext('state.draft.treasures[1].assigneePending', ctx), true);
});
