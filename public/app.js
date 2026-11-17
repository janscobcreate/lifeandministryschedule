'use strict';
const state = {
  adminRoute: /^\/admin\/?$/.test(window.location.pathname),
  authenticated: false, adminEnabled: false, weeks: [], currentWeekStart: '', selected: '',
  editing: false, draft: null, dirty: false, showPast: false, viewPublic: false, saving: false
};
// No management controls appear on the public URL, even if an admin is signed in.
document.body.classList.toggle('public-view', !state.adminRoute);
const dom = {
  main: document.getElementById('main-content'), nav: document.getElementById('week-navigation'),
  actions: document.getElementById('topbar-actions'), shell: document.getElementById('app-shell'),
  modal: document.getElementById('login-modal'), loginError: document.getElementById('login-error'),
  toast: document.getElementById('toast')
};
const rules = window.MeetingRules;
const htmlEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
const short = (value, max = 100) => htmlEscape(String(value ?? '').slice(0, max));
const atMidday = (iso) => new Date(`${iso}T12:00:00Z`);
const addDays = (iso, days) => { const d = atMidday(iso); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const dateFormat = (date, options) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(atMidday(date));
const getWeek = (iso, week = { weekStart: iso }) => {
  const end = addDays(iso, 6), a = atMidday(iso), b = atMidday(end);
  const meetingDate = rules.meetingDateFor(week);
  const displayDate = meetingDate || rules.thursdayFor(iso);
  const dayName = meetingDate ? dateFormat(meetingDate, { weekday: 'long' }) : 'No meeting';
  const year = atMidday(displayDate).getUTCFullYear();
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  const months = sameMonth
    ? `${a.getUTCDate()} – ${b.getUTCDate()} ${dateFormat(end, { month: 'long' })}`
    : `${a.getUTCDate()} ${dateFormat(iso, { month: 'short' })} – ${b.getUTCDate()} ${dateFormat(end, { month: 'short' })}`;
  const sidebar = sameMonth
    ? `${a.getUTCDate()} – ${b.getUTCDate()} ${dateFormat(end, { month: 'short' })}`
    : `${a.getUTCDate()} ${dateFormat(iso, { month: 'short' })} – ${b.getUTCDate()} ${dateFormat(end, { month: 'short' })}`;
  return { end, year, months, sidebar, meetingDate, dayName,
    displayDate, dateLong: meetingDate ? dateFormat(meetingDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'No meeting this week',
    month: dateFormat(displayDate, { month: 'short' }).toUpperCase(),
    day: atMidday(displayDate).getUTCDate(), monthYear: `${dateFormat(iso, { month: 'long' })} ${a.getUTCFullYear()}`, full: `${months} ${year}` };
};
function visibleWeeks() {
  return state.weeks.filter((w) => {
    if (!state.authenticated || state.viewPublic) return w.published && w.weekStart >= state.currentWeekStart;
    return state.showPast || w.weekStart >= state.currentWeekStart;
  });
}
function selectedWeek() { return state.weeks.find((w) => w.weekStart === state.selected); }
function setInitialSelection() {
  const visible = visibleWeeks();
  if (!visible.some((w) => w.weekStart === state.selected)) {
    state.selected = visible.find((w) => w.weekStart === state.currentWeekStart)?.weekStart || visible[0]?.weekStart || '';
  }
}
async function api(endpoint, options = {}) {
  const result = await fetch(endpoint, { credentials: 'same-origin', ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(data.error || `Request failed (${result.status})`);
  return data;
}
async function reload() {
  const data = await api('/api/bootstrap');
  state.authenticated = state.adminRoute && data.authenticated;
  state.adminEnabled = data.adminEnabled;
  state.weeks = data.weeks;
  state.currentWeekStart = data.currentWeekStart;
  if (!state.authenticated) { state.editing = false; state.draft = null; state.viewPublic = false; }
  setInitialSelection();
  render();
}
function toast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => dom.toast.classList.add('hidden'), 3600);
}
function renderHeader() {
  // Members only see Share on the public link; admin controls live at /admin.
  dom.actions.innerHTML = !state.adminRoute
    ? `<button type="button" class="button button-outline" data-action="share">↗ Share</button>`
    : state.authenticated
    ? `<span class="status-badge published admin-label">ADMIN ACCESS</span>
       <button type="button" class="button button-outline" data-action="share">↗ <span class="admin-label">Copy public link</span><span class="mobile-only-label">Share</span></button>
       <button type="button" class="button button-outline" data-action="logout">Sign out</button>`
    : `<button type="button" class="button button-outline" data-action="share">↗ Share</button>
       <button type="button" class="button button-soft" data-action="show-login">Admin login</button>`;
}
function navGroup(title, weeks) {
  if (!weeks.length) return '';
  return `<div class="nav-group-title">${title}</div>${weeks.map((w) => {
    const display = getWeek(w.weekStart, w);
    return `<button type="button" class="week-link ${state.selected === w.weekStart ? 'active' : ''}" data-action="select-week" data-week="${w.weekStart}" aria-current="${state.selected === w.weekStart ? 'page' : 'false'}">
      <span class="nav-date-box"><strong>${display.day}</strong><small>${display.month}</small></span>
      <span class="week-link-text"><strong>${display.meetingDate ? `${display.dayName.slice(0, 3)} ${display.day} ${dateFormat(display.displayDate, { month: 'short' })}` : 'No meeting this week'}</strong><small>${htmlEscape(display.sidebar)} · ${rules.typeOf(w) === 'regular' ? (w.weekStart === state.currentWeekStart ? 'Current week' : w.published ? 'Published' : 'Draft') : htmlEscape(rules.TYPE_LABELS[rules.typeOf(w)])}</small></span>
      <span class="nav-status-dot ${w.published ? '' : 'draft'}" title="${w.published ? 'Published' : 'Draft'}"></span>
    </button>`;
  }).join('')}`;
}
function renderNav() {
  const weeks = visibleWeeks();
  const current = weeks.filter((w) => w.weekStart === state.currentWeekStart);
  const upcoming = weeks.filter((w) => w.weekStart > state.currentWeekStart);
  const past = weeks.filter((w) => w.weekStart < state.currentWeekStart);
  dom.nav.innerHTML = (current.length || upcoming.length || past.length)
    ? `${navGroup('This week', current)}${navGroup('Coming up', upcoming)}${navGroup('Previous weeks', past)}`
    : `<div class="nav-group-title">No published weeks yet</div>`;
  if (state.authenticated && !state.viewPublic) dom.nav.innerHTML += `
    <button class="add-row side-add-week" type="button" data-action="add-week">＋ Add a future week</button>
    <button class="button button-outline side-past-toggle" type="button" data-action="toggle-past">${state.showPast ? 'Hide previous weeks' : 'Show previous weeks'}</button>`;
}
function person(name, role, pending = false) {
  return `<div class="person-name ${name ? '' : pending ? 'pending-name' : 'unassigned'}">${name ? short(name) : pending ? 'Pending' : 'To be assigned'}${role ? ` <span class="person-meta">· ${htmlEscape(role)}</span>` : ''}</div>`;
}
function assignmentsRow(part, section) {
  const people = section === 'ministry'
    ? `<div class="assigned-people">${person(part.assignee, 'Assignee', part.assigneePending)}${part.assistant ? `<div class="assigned-second">${short(part.assistant)} <span class="person-meta">· Assistant</span></div>` : part.assistantPending ? `<div class="assigned-second pending-name">Pending <span class="person-meta">· Assistant</span></div>` : `<div class="assigned-second"><span class="person-meta">Assistant: Not assigned</span></div>`}</div>`
    : part.type === 'co_talk'
    ? `<div class="assigned-people">${person(part.assignee, 'Circuit Overseer', part.assigneePending)}</div>`
    : part.type === 'study'
    ? `<div class="assigned-people">${person(part.conductor, 'Conductor', part.conductorPending)}${part.reader ? `<div class="assigned-second">${short(part.reader)} <span class="person-meta">· Reader</span></div>` : part.readerPending ? `<div class="assigned-second pending-name">Pending <span class="person-meta">· Reader</span></div>` : `<div class="assigned-second"><span class="person-meta">Reader: Not assigned</span></div>`}</div>`
    : `<div class="assigned-people">${person(part.assignee, '', part.assigneePending)}</div>`;
  return `<div class="assignment-row ${['study', 'co_talk'].includes(part.type) ? 'study-row' : ''}">
    <div class="assignment-num">${short(part.number || '—', 15)}</div>
    <div class="assignment-details"><strong>${short(part.title || 'Untitled assignment')}</strong>${part.topic ? `<div class="topic">${short(part.topic, 250)}</div>` : ''}</div>
    ${Number(part.minutes) > 0 ? `<div class="minute-chip">${Number(part.minutes)} min</div>` : ''}
    ${people}
  </div>`;
}
function sectionCard({ color, icon, name, note, parts, section }) {
  return `<section class="section-panel ${color}" aria-label="${htmlEscape(name)}"><div class="section-header"><div class="section-symbol ${color}" aria-hidden="true">${icon}</div><div class="section-header-title"><h3>${htmlEscape(name)}</h3><p>${htmlEscape(note)}</p></div><span class="section-count">${parts.length} ${parts.length === 1 ? 'PART' : 'PARTS'}</span></div><div>${parts.length ? parts.map((p) => assignmentsRow(p, section)).join('') : '<div class="section-footer">No assignments added for this section yet.</div>'}</div></section>`;
}
function renderSchedule(week) {
  const display = getWeek(week.weekStart, week);
  const type = rules.typeOf(week);
  const hasMeeting = rules.hasMeeting(week);
  const livingParts = rules.visibleLiving(week);
  const count = hasMeeting ? week.treasures.length + week.ministry.length + livingParts.length : 0;
  const notice = rules.specialNotice(week);
  const banner = state.authenticated && !week.published ? `<div class="small-banner">✦ This week is still a draft. Only administrators can see it until it is published.</div>` : '';
  const previewBanner = state.viewPublic ? `<div class="small-banner green">✓ Public view — only published weeks are visible.</div>` : '';
  dom.main.innerHTML = `
    <div class="page-heading"><div><div class="eyebrow">WEEKLY MEETING PROGRAMME</div><h1>Life and Ministry Schedule</h1><p>A clear view of every assignment, every week.</p></div>
    <div class="heading-actions">${state.authenticated ? `
      <button class="button button-outline" type="button" data-action="toggle-public">${state.viewPublic ? 'Exit public preview' : 'Preview public view'}</button>
      ${!state.viewPublic ? '<button class="button button-primary" type="button" data-action="edit-week">✎ Edit this week</button>' : ''}` : ''}</div></div>
    ${previewBanner}${banner}
    <section class="hero"><div class="hero-copy"><span class="hero-label">✦ &nbsp; ${week.weekStart === state.currentWeekStart ? 'THIS WEEK’S PROGRAMME' : 'UPCOMING PROGRAMME'}</span>
      <h2>${display.meetingDate ? `${htmlEscape(display.dayName)}, ${htmlEscape(dateFormat(display.displayDate, { day: 'numeric', month: 'long' }))}` : 'No weekday meeting'}</h2>
      <p>${htmlEscape(display.year)} &nbsp;·&nbsp; ${htmlEscape(rules.TYPE_LABELS[type])}<br>Week of ${htmlEscape(display.months)} ${htmlEscape(display.year)}</p></div>
      <div class="hero-aside"><span class="hero-flower" aria-hidden="true">✳</span><div class="hero-calendar"><span>${htmlEscape(display.dayName.toUpperCase())}</span><strong>${display.meetingDate ? display.day : '—'}</strong><small>${display.meetingDate ? `${display.month} ${htmlEscape(display.year)}` : 'SPECIAL WEEK'}</small></div></div></section>
    ${notice ? `<div class="special-notice ${hasMeeting ? 'meeting-held' : 'no-meeting'}"><span class="special-notice-icon" aria-hidden="true">${hasMeeting ? '✦' : '▦'}</span><div><strong>${htmlEscape(rules.TYPE_LABELS[type])}</strong><p>${htmlEscape(notice)}</p></div></div>` : ''}
    ${hasMeeting ? `<div class="info-strip"><div class="stat-card"><span class="stat-icon purple">♙</span><div><span>Meeting chairman</span><strong>${week.chairman ? short(week.chairman) : week.chairmanPending ? '<span class="pending-name">Pending</span>' : 'To be assigned'}</strong></div></div>
      <div class="stat-card"><span class="stat-icon teal">▦</span><div><span>Total assignments</span><strong>${count} scheduled parts</strong></div></div>
      <div class="stat-card"><span class="stat-icon orange">◷</span><div><span>Meeting date</span><strong>${htmlEscape(display.dateLong)}</strong></div></div></div>
    <div class="content-grid">
      ${sectionCard({ color: 'purple', icon: '✧', name: 'Treasures from God’s Word', note: 'Talk · Spiritual Gems · Bible Reading', parts: week.treasures, section: 'treasures' })}
      ${sectionCard({ color: 'teal', icon: '✦', name: 'Apply Yourself to the Field Ministry', note: 'Practice and improve your ministry skills', parts: week.ministry, section: 'ministry' })}
      ${sectionCard({ color: 'orange', icon: '♡', name: 'Living as Christians', note: type === 'co_visit' ? 'Christian living · First Circuit Overseer’s Talk' : 'Christian living · Congregation Bible Study', parts: livingParts, section: 'living' })}
    </div>` : `<section class="no-meeting-card"><div class="no-meeting-emblem" aria-hidden="true">▦</div><h3>No Life and Ministry meeting this week</h3><p>No assignments are displayed for this week. Use the menu on the left to check the next scheduled meeting.</p></section>`}`;
}
function renderEmpty() {
  dom.main.innerHTML = `<div class="page-heading"><div><div class="eyebrow">WEEKLY MEETING PROGRAMME</div><h1>Life and Ministry Schedule</h1><p>Meeting assignments, week by week.</p></div></div>
    <div class="empty-state"><span class="empty-icon">▤</span><h2>${state.viewPublic ? 'No published schedules yet' : 'Your schedule is being prepared'}</h2>
    <p>${state.authenticated ? (state.viewPublic ? 'Publish a week in the admin editor to make it visible to everyone.' : 'Select a week from the left-hand menu to begin adding assignments.') : 'The upcoming meeting schedule has not been published yet. Please check back soon for the assignments.'}</p>
    ${state.authenticated && state.viewPublic ? '<button class="button button-primary" data-action="toggle-public">Return to admin view</button>' : state.authenticated ? '<button class="button button-primary" data-action="add-week">Add a week</button>' : ''}</div>`;
}
function formInput(label, value, section, index, field, placeholder = '', extraClass = '') {
  const attrs = section ? `data-section="${section}" data-index="${index}" data-field="${field}"` : `data-field="${field}"`;
  const type = field === 'minutes' ? 'number' : 'text';
  const bounds = type === 'number' ? ' min="0" max="240" step="1"' : ' maxlength="250"';
  return `<div class="field ${extraClass}"><label>${htmlEscape(label)}</label><input type="${type}" ${attrs}${bounds} value="${htmlEscape(value)}" placeholder="${htmlEscape(placeholder)}" autocomplete="off" /></div>`;
}
function formPersonInput(label, value, section, index, field, pending = false, placeholder = 'Full name') {
  const pendingKey = `${field}Pending`;
  const attrs = section ? `data-section="${section}" data-index="${index}"` : '';
  return `<div class="field person-field"><label>${htmlEscape(label)}</label>
    <input type="text" ${attrs} data-field="${field}" maxlength="160" value="${htmlEscape(value)}" placeholder="${htmlEscape(placeholder)}" autocomplete="off" />
    <label class="pending-field-toggle"><input type="checkbox" ${attrs} data-field="${pendingKey}" ${pending ? 'checked' : ''} ${value ? 'disabled' : ''}/><span>Pending — name not confirmed yet</span></label></div>`;
}
function editorAssignment(part, section, i) {
  const isStudy = part.type === 'study';
  const isTreasure = section === 'treasures';
  const count = state.draft[section].length;
  const canReorder = !isStudy && !isTreasure;
  const lastMovable = section === 'living' ? count - 2 : count - 1;
  const label = isStudy ? 'Congregation Bible Study' : part.title || `Assignment ${i + 1}`;
  return `<div class="edit-assignment"><div class="edit-assignment-top"><strong><span class="edit-index">${i + 1}</span> ${short(label, 100)}</strong>
    <div class="part-actions">${canReorder ? `
      <button class="mini-button" type="button" data-action="move-part" data-section="${section}" data-index="${i}" data-dir="-1" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="mini-button" type="button" data-action="move-part" data-section="${section}" data-index="${i}" data-dir="1" title="Move down" ${i >= lastMovable ? 'disabled' : ''}>↓</button>
      <button class="mini-button remove" type="button" data-action="remove-part" data-section="${section}" data-index="${i}" title="Remove this assignment">✕</button>` : ''}</div></div>
    <div class="field-grid three">${formInput('Part number', part.number, section, i, 'number', 'e.g. 4')}
      ${isStudy ? `<div class="field"><label>Assignment</label><input value="Congregation Bible Study" disabled /></div>` : formInput('Assignment title', part.title, section, i, 'title', 'Assignment title')}
      ${formInput('Minutes', part.minutes, section, i, 'minutes', 'e.g. 5')}
    </div>
    <div class="field-grid two field-grid-spaced">${formInput('Topic or theme (optional)', part.topic, section, i, 'topic', 'Enter the talk topic or theme', 'span-full')}
      ${isStudy ? `${formPersonInput('Conductor', part.conductor, section, i, 'conductor', part.conductorPending)}${formPersonInput('Reader', part.reader, section, i, 'reader', part.readerPending)}`
      : `${formPersonInput('Assignee', part.assignee, section, i, 'assignee', part.assigneePending)}${section === 'ministry' ? formPersonInput('Assistant', part.assistant, section, i, 'assistant', part.assistantPending, 'Full name (optional)') : ''}`}
    </div></div>`;
}
function editPanel(label, description, section, action, addLabel) {
  const items = section === 'living' && rules.typeOf(state.draft) === 'co_visit'
    ? state.draft.living.filter((p) => p.type !== 'study') : state.draft[section];
  return `<section class="edit-panel"><div class="edit-panel-head"><div><h3>${htmlEscape(label)}</h3><p>${htmlEscape(description)}</p></div><span class="section-count">${items.length} PARTS</span></div><div class="edit-panel-body">${items.map((p, i) => editorAssignment(p, section, i)).join('')}
    ${action ? `<button type="button" class="add-row" data-action="${action}">＋ ${htmlEscape(addLabel)}</button>` : ''}
    ${section === 'living' ? `<div class="edit-note">${rules.typeOf(state.draft) === 'co_visit' ? 'First Circuit Overseer’s Talk is the final part for this week. The Bible Study entry is saved for normal weeks.' : 'Congregation Bible Study remains the final part and always has dedicated Conductor and Reader fields.'}</div>` : ''}
    ${section === 'treasures' ? '<div class="edit-note">The 10-minute talk, 10-minute Spiritual Gems and 5-minute Bible Reading are the three standard parts. You can edit their titles, topics, numbers and assigned names.</div>' : ''}</div></section>`;
}
function selectField(label, field, value, choices, note = '') {
  return `<div class="field"><label for="setting-${field}">${htmlEscape(label)}</label>
    <select id="setting-${field}" data-field="${field}">${Object.entries(choices).map(([key, text]) =>
      `<option value="${htmlEscape(key)}" ${value === key ? 'selected' : ''}>${htmlEscape(text)}</option>`).join('')}</select>
    ${note ? `<p class="field-hint">${htmlEscape(note)}</p>` : ''}</div>`;
}
function renderEditor() {
  const week = state.draft, display = getWeek(week.weekStart, week);
  const type = rules.typeOf(week), meetingHeld = rules.hasMeeting(week);
  const notice = rules.specialNotice(week);
  const coTalk = { ...rules.defaultCOTalk(week), ...(week.coTalk || {}) };
  dom.main.innerHTML = `<div class="editor-head"><div class="editor-title"><p class="eyebrow">ADMINISTRATOR · EDIT WEEK</p><h1>${display.meetingDate ? htmlEscape(display.dateLong) : `No weekday meeting · ${htmlEscape(display.full)}`}</h1><p>Week of ${htmlEscape(display.full)} · Select the meeting type before entering assignments.</p></div>
    <div class="editor-actions"><span class="status-badge ${week.published ? 'published' : ''}">${week.published ? '● PUBLISHED' : '● DRAFT'}</span><button class="button button-soft" type="button" data-action="auto-number" ${meetingHeld ? '' : 'disabled'}># Auto-number</button><button class="button button-outline" type="button" data-action="cancel-edit">✕ Close editor</button></div></div>
    <section class="edit-panel special-week-editor"><div class="edit-panel-head"><div><h3>Meeting type for this week</h3><p>Choose a regular or special week. The display adjusts automatically.</p></div></div>
      <div class="edit-panel-body"><div class="field-grid">${selectField('Week type', 'weekType', type, rules.TYPE_LABELS)}
        ${type === 'memorial' ? selectField('When is the Memorial?', 'memorialTiming', rules.timingOf(week), rules.TIMING_LABELS, 'Weekday: no Thursday meeting. Weekend: Thursday meeting holds; no weekend meeting.') : `<div class="edit-option-explainer"><strong>Meeting day</strong><span>${display.meetingDate ? htmlEscape(display.dateLong) : 'No meeting this week'}</span></div>`}</div>
        ${notice ? `<div class="edit-note special-editor-note">${htmlEscape(notice)}</div>` : ''}
        ${!meetingHeld ? '<div class="edit-note">The existing chairman and assignment details are safely preserved. They are hidden from the public while this week has no weekday meeting. Switch to a meeting week to edit them.</div>' : ''}
        ${type === 'co_visit' ? '<div class="pending-tools"><div><strong>Names not available yet?</strong><p>Set every unfilled role to Pending at once. Any names already entered will remain unchanged. You can replace Pending with a name later.</p></div><button type="button" class="button button-soft" data-action="mark-co-pending">Mark unassigned roles as Pending</button></div>' : ''}
      </div></section>
    ${meetingHeld ? `<section class="edit-panel"><div class="edit-panel-head"><div><h3>Meeting chairman</h3><p>Assign the brother who will chair this ${htmlEscape(display.dayName)} meeting.</p></div></div><div class="edit-panel-body"><div class="field-grid">${formPersonInput('Chairman’s name', week.chairman, '', '', 'chairman', week.chairmanPending, 'Enter chairman’s full name')}</div></div></section>
    ${editPanel('1. Treasures from God’s Word', 'The three regular assignments', 'treasures', null, null)}
    ${editPanel('2. Apply Yourself to the Field Ministry', 'Add or remove parts; every part has Assignee and Assistant fields', 'ministry', 'add-ministry', 'Add field ministry assignment')}
    ${editPanel('3. Living as Christians', type === 'co_visit' ? 'Congregation Bible Study is replaced by the First Circuit Overseer’s Talk' : 'Add or remove parts before the Congregation Bible Study', 'living', 'add-living', 'Add Christian living assignment')}
    ${type === 'co_visit' ? `<section class="edit-panel co-talk-editor"><div class="edit-panel-head"><div><h3>First Circuit Overseer’s Talk</h3><p>Shown instead of the Congregation Bible Study. No conductor or reader is needed.</p></div></div><div class="edit-panel-body">
      <div class="field-grid three">${formInput('Part number', coTalk.number, 'coTalk', 0, 'number', 'e.g. 8')}${formInput('Talk title', coTalk.title, 'coTalk', 0, 'title', 'First Circuit Overseer’s Talk')}${formInput('Minutes (0 = not specified)', coTalk.minutes, 'coTalk', 0, 'minutes', 'Optional')}</div>
      <div class="field-grid two field-grid-spaced">${formInput('Talk theme (optional)', coTalk.topic, 'coTalk', 0, 'topic', 'Theme', 'span-full')}${formPersonInput('Circuit Overseer / Speaker', coTalk.assignee, 'coTalk', 0, 'assignee', coTalk.assigneePending)}</div></div></section>` : ''}` : ''}
    <div class="sticky-editor-bar"><p>${state.dirty ? '● You have unsaved changes' : 'Keep this week as a draft or make it public.'}</p><div class="editor-actions">
      ${week.published ? '<button type="button" class="button button-danger" data-action="unpublish">Unpublish</button>' : ''}
      <button type="button" class="button button-outline" data-action="save-week">Save ${week.published ? 'changes' : 'draft'}</button>
      ${!week.published ? '<button type="button" class="button button-primary" data-action="publish-week">✓ Publish week</button>' : ''}
    </div></div>`;
}
function render() {
  renderHeader();
  setInitialSelection();
  renderNav();
  if (state.editing && state.draft) renderEditor();
  else if (!selectedWeek() || !visibleWeeks().some((w) => w.weekStart === state.selected)) renderEmpty();
  else renderSchedule(selectedWeek());
}
function confirmLeaveEditor() {
  return !state.editing || !state.dirty || window.confirm('You have unsaved changes. Discard them?');
}
function startEdit() {
  if (!state.authenticated || !selectedWeek()) return;
  state.draft = JSON.parse(JSON.stringify(selectedWeek()));
  state.draft.weekType = rules.typeOf(state.draft);
  state.draft.memorialTiming = rules.timingOf(state.draft);
  state.draft.coTalk = { ...rules.defaultCOTalk(state.draft), ...(state.draft.coTalk || {}) };
  state.dirty = false;
  state.editing = true;
  state.viewPublic = false;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function addPart(section) {
  const pieces = state.draft[section];
  if (pieces.length >= 12) return toast('Maximum 12 parts per section.');
  const isLiving = section === 'living';
  const insertIndex = isLiving ? pieces.length - 1 : pieces.length;
  const all = [...state.draft.treasures, ...state.draft.ministry, ...state.draft.living];
  const nums = all.map((p) => Number(p.number)).filter(Number.isFinite);
  const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
  const part = { id: crypto.randomUUID(), number: String(nextNum), title: isLiving ? 'Living as Christians' : 'Field Ministry Assignment', topic: '', minutes: isLiving ? 10 : 5, assignee: '' };
  if (!isLiving) part.assistant = '';
  pieces.splice(insertIndex, 0, part);
  // Keep the default sequence convenient; numbers always remain manually editable.
  if (isLiving) {
    const study = pieces[pieces.length - 1];
    const n = Number(study.number);
    if (Number.isFinite(n)) study.number = String(Math.max(n + 1, nextNum + 1));
    if (rules.typeOf(state.draft) === 'co_visit') state.draft.coTalk.number = study.number;
  }
  state.dirty = true;
  render();
}
function movePart(section, index, dir) {
  const arr = state.draft[section], target = index + dir;
  const lastMovable = section === 'living' ? arr.length - 2 : arr.length - 1;
  if (target < 0 || target > lastMovable) return;
  [arr[index], arr[target]] = [arr[target], arr[index]];
  state.dirty = true; render();
}
function removePart(section, index) {
  const arr = state.draft[section];
  if (arr[index]?.type === 'study') return;
  arr.splice(index, 1); state.dirty = true; render();
}
async function saveWeek(published) {
  if (state.saving || !state.draft) return;
  state.saving = true;
  try {
    const draft = { ...state.draft, published };
    await api(`/api/weeks/${encodeURIComponent(draft.weekStart)}`, { method: 'PUT', body: JSON.stringify(draft) });
    state.editing = false; state.draft = null; state.dirty = false;
    await reload();
    toast(published ? 'Week saved and published. Everyone can now view it.' : 'Week saved as a draft.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) { toast(err.message); }
  finally { state.saving = false; }
}
async function clipboard() {
  const url = `${window.location.origin}/`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Public schedule link copied! Share it in your group.');
  } catch {
    window.prompt('Copy this link and share it in your group:', url);
  }
}
function closeMenu() { dom.shell.classList.remove('menu-open'); }
async function performAction(element) {
  const { action } = element.dataset;
  if (action === 'show-login') {
    dom.loginError.classList.add('hidden'); dom.modal.classList.remove('hidden');
    document.getElementById('admin-password').focus();
  } else if (action === 'hide-login') dom.modal.classList.add('hidden');
  else if (action === 'open-menu') dom.shell.classList.add('menu-open');
  else if (action === 'close-menu') closeMenu();
  else if (action === 'share') await clipboard();
  else if (action === 'select-week') {
    if (!confirmLeaveEditor()) return;
    state.selected = element.dataset.week;
    state.editing = false; state.draft = null; state.dirty = false;
    closeMenu(); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (action === 'edit-week') startEdit();
  else if (action === 'cancel-edit') {
    if (!confirmLeaveEditor()) return;
    state.editing = false; state.draft = null; state.dirty = false; render();
  } else if (action === 'add-ministry') addPart('ministry');
  else if (action === 'add-living') addPart('living');
  else if (action === 'move-part') movePart(element.dataset.section, Number(element.dataset.index), Number(element.dataset.dir));
  else if (action === 'remove-part') removePart(element.dataset.section, Number(element.dataset.index));
  else if (action === 'save-week') await saveWeek(state.draft.published);
  else if (action === 'publish-week') await saveWeek(true);
  else if (action === 'unpublish') {
    if (window.confirm('Unpublish this week? It will no longer appear on the public schedule.')) await saveWeek(false);
  } else if (action === 'mark-co-pending') {
    if (!state.editing || rules.typeOf(state.draft) !== 'co_visit') return;
    const changed = rules.markEmptyRolesPending(state.draft);
    if (changed) { state.dirty = true; render(); }
    toast(changed ? `${changed} unfilled role${changed === 1 ? '' : 's'} marked Pending. Save or publish the week to keep them.` : 'All unfilled roles are already marked Pending.');
  } else if (action === 'auto-number') {
    let n = 1;
    for (const section of ['treasures', 'ministry', 'living']) {
      for (const part of state.draft[section]) part.number = String(n++);
    }
    if (state.draft.coTalk) state.draft.coTalk.number = state.draft.living.at(-1)?.number || String(n);
    state.dirty = true; render(); toast('Part numbers updated in order.');
  } else if (action === 'retry') await reload();
  else if (action === 'toggle-past') {
    if (!confirmLeaveEditor()) return;
    state.showPast = !state.showPast; state.editing = false; render();
  } else if (action === 'toggle-public') {
    if (!confirmLeaveEditor()) return;
    state.editing = false; state.viewPublic = !state.viewPublic; render();
  } else if (action === 'add-week') {
    if (!confirmLeaveEditor()) return;
    try {
      const { week } = await api('/api/weeks/next', { method: 'POST', body: JSON.stringify({}) });
      state.selected = week.weekStart; state.editing = false; state.draft = null; state.dirty = false;
      await reload(); startEdit();
      toast('A new week was added.');
    } catch (err) { toast(err.message); }
  } else if (action === 'logout') {
    if (!confirmLeaveEditor()) return;
    try { await api('/api/logout', { method: 'POST', body: JSON.stringify({}) }); state.editing = false; state.viewPublic = false; await reload(); toast('Signed out.'); }
    catch (err) { toast(err.message); }
  }
}
document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-action]');
  if (btn) { ev.preventDefault(); performAction(btn).catch((err) => toast(err.message)); }
});
function updateEditorField(input) {
  if (!state.editing || !state.draft || !input.matches('input[data-field], select[data-field]')) return;
  const { section, index, field } = input.dataset;
  const target = section === 'coTalk' ? state.draft.coTalk : section ? state.draft[section]?.[Number(index)] : state.draft;
  const isPendingToggle = /^(chairman|assignee|assistant|conductor|reader)Pending$/.test(field);
  if (!target || (!Object.prototype.hasOwnProperty.call(target, field) && !isPendingToggle)) return;
  target[field] = input.type === 'checkbox' ? input.checked : field === 'minutes'
    ? (input.value === '' ? 0 : Number(input.value)) : input.value;
  if (['chairman', 'assignee', 'assistant', 'conductor', 'reader'].includes(field)) {
    // A confirmed name takes precedence over Pending.
    if (input.value.trim()) target[`${field}Pending`] = false;
    const toggle = input.closest('.person-field')?.querySelector('input[type="checkbox"]');
    if (toggle) { toggle.disabled = Boolean(input.value.trim()); if (toggle.disabled) toggle.checked = false; }
  }
  state.dirty = true;
  if (input.tagName === 'SELECT') render();
}
document.addEventListener('input', (ev) => {
  if (ev.target.tagName !== 'SELECT') updateEditorField(ev.target);
});
document.addEventListener('change', (ev) => {
  if (ev.target.tagName === 'SELECT' || ev.target.type === 'checkbox') updateEditorField(ev.target);
});
document.getElementById('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const password = document.getElementById('admin-password').value;
  const submit = ev.target.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
    document.getElementById('admin-password').value = '';
    dom.modal.classList.add('hidden');
    state.viewPublic = false;
    await reload(); toast('Signed in. Select any week to edit the programme.');
  } catch (err) {
    dom.loginError.textContent = err.message;
    dom.loginError.classList.remove('hidden');
  } finally { submit.disabled = false; }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') { dom.modal.classList.add('hidden'); closeMenu(); }
});
reload().then(() => {
  if (state.adminRoute && !state.authenticated) {
    dom.loginError.classList.add('hidden');
    dom.modal.classList.remove('hidden');
    document.getElementById('admin-password').focus();
  }
}).catch((err) => {
  dom.main.innerHTML = `<div class="empty-state"><span class="empty-icon">!</span><h2>Unable to load schedule</h2><p>${htmlEscape(err.message)}. Please check your connection or server configuration.</p><button type="button" class="button button-primary" data-action="retry">Try again</button></div>`;
});
