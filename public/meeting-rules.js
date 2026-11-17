'use strict';
// Shared by the Node.js API, the public schedule and automated tests.
(function (root, factory) {
  const rules = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
  if (root) root.MeetingRules = rules;
})(typeof window === 'undefined' ? null : window, function () {
  const TYPE_LABELS = Object.freeze({
    regular: 'Regular week',
    co_visit: 'Circuit Overseer (CO) visit',
    circuit_assembly: 'Circuit Assembly week',
    convention: 'Convention week',
    memorial: 'Memorial week'
  });
  const TIMING_LABELS = Object.freeze({
    weekday: 'Memorial on a weekday (Monday–Friday)',
    weekend: 'Memorial on the weekend (Saturday–Sunday)'
  });
  const types = Object.keys(TYPE_LABELS);
  function typeOf(week) {
    return types.includes(week?.weekType) ? week.weekType : 'regular';
  }
  function timingOf(week) {
    return week?.memorialTiming === 'weekend' ? 'weekend' : 'weekday';
  }
  // CO visit replaces the regular Thursday meeting with a Tuesday meeting.
  function meetingDayOf(week) {
    const type = typeOf(week);
    if (type === 'co_visit') return 'tuesday';
    if (type === 'regular' || (type === 'memorial' && timingOf(week) === 'weekend')) return 'thursday';
    return null;
  }
  function hasMeeting(week) { return meetingDayOf(week) !== null; }
  function hasThursdayMeeting(week) { return meetingDayOf(week) === 'thursday'; }
  function markEmptyRolesPending(week) {
    if (typeOf(week) !== 'co_visit') return 0;
    let changed = 0;
    function mark(part, nameKey, pendingKey) {
      if (part && !String(part[nameKey] ?? '').trim() && part[pendingKey] !== true) {
        part[pendingKey] = true;
        changed++;
      }
    }
    mark(week, 'chairman', 'chairmanPending');
    for (const part of week.treasures || []) mark(part, 'assignee', 'assigneePending');
    for (const part of week.ministry || []) {
      mark(part, 'assignee', 'assigneePending');
      mark(part, 'assistant', 'assistantPending');
    }
    for (const part of week.living || []) {
      if (part.type !== 'study') mark(part, 'assignee', 'assigneePending');
    }
    mark(week.coTalk, 'assignee', 'assigneePending');
    return changed;
  }
  function defaultCOTalk(week) {
    const bibleStudy = Array.isArray(week?.living) ? week.living.find((p) => p.type === 'study') : null;
    return { id: 'co-talk', type: 'co_talk', number: bibleStudy?.number || '8',
      title: 'First Circuit Overseer’s Talk', topic: '', minutes: 0, assignee: '', assigneePending: false };
  }
  function visibleLiving(week) {
    const parts = Array.isArray(week?.living) ? week.living : [];
    if (typeOf(week) !== 'co_visit') return parts;
    return [
      ...parts.filter((p) => p.type !== 'study'),
      { ...defaultCOTalk(week), ...(week.coTalk || {}), type: 'co_talk', id: 'co-talk' }
    ];
  }
  function specialNotice(week) {
    const type = typeOf(week);
    if (type === 'co_visit') return 'Circuit Overseer visit: the Life and Ministry meeting takes place on Tuesday, not Thursday. The Congregation Bible Study is replaced by the First Circuit Overseer’s Talk.';
    if (type === 'circuit_assembly') return 'Circuit Assembly week: no Life and Ministry meeting assignments are scheduled for this week.';
    if (type === 'convention') return 'Convention week: no Life and Ministry meeting assignments are scheduled for this week.';
    if (type === 'memorial' && timingOf(week) === 'weekday') return 'Memorial week (weekday): there will be no regular Thursday Life and Ministry meeting.';
    if (type === 'memorial') return 'Memorial week (weekend): the Thursday Life and Ministry meeting proceeds as usual. No weekend meeting is scheduled.';
    return '';
  }
  function plusDays(iso, days) {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function thursdayFor(weekStart) { return plusDays(weekStart, 3); }
  function tuesdayFor(weekStart) { return plusDays(weekStart, 1); }
  // For weeks with no meeting, the date is null; callers can show a no-meeting notice.
  function meetingDateFor(week) {
    const day = meetingDayOf(week);
    if (!day) return null;
    return day === 'tuesday' ? tuesdayFor(week.weekStart) : thursdayFor(week.weekStart);
  }
  return { TYPE_LABELS, TIMING_LABELS, typeOf, timingOf, meetingDayOf, hasMeeting,
    hasThursdayMeeting, meetingDateFor, markEmptyRolesPending,
    defaultCOTalk, visibleLiving, specialNotice, tuesdayFor, thursdayFor };
});
