const { $, $$, h, esc, busy, toast, download, md, store } = Kit;
const COLORS = ['#b45309', '#2f7de1', '#1f9d63', '#d6457a', '#7c5cd6', '#0ea5a8', '#c98a0b', '#64748b'];
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const uid = () => Math.random().toString(36).slice(2, 9);
let meetings = store.get('meetings', null);
if (!meetings) meetings = [{ id: uid(), title: 'Beta launch go/no-go', date: todayISO(), text: SAMPLE_TRANSCRIPT, minutes: null }];
let curId = store.get('current', meetings[0].id);
const save = () => store.set('current', curId);
const cur = () => meetings.find((m) => m.id === curId) || meetings[0];
const turnsOf = (m) => m._turns || (m._turns = parseTranscript(m.text));
const persist = () => store.set('meetings', meetings.map((m) => { const { _turns, ...rest } = m; return rest; }));
const colorMap = (A) => Object.fromEntries(A.list.map((s, i) => [s.name, COLORS[i % COLORS.length]]));

/* ================= analyze ================= */
function loadEditor() { const m = cur(); $('#tx').value = m.text; $('#mTitle').value = m.title; $('#mDate').value = m.date; }
function renderAnalysis() {
  const m = cur(), T = turnsOf(m);
  if (!T.length) { $('#tiles').innerHTML = ''; $('#timeline').innerHTML = '<div class="empty">No speaker turns found. Use "Name: text" lines.</div>'; return; }
  const A = analyzeTurns(T), col = colorMap(A);
  const balance = A.gini < 0.15 ? ['good', 'Balanced'] : A.gini < 0.3 ? ['warn', 'Somewhat uneven'] : ['bad', 'Dominated'];
  $('#tiles').innerHTML = [['Duration', fmtTime(A.dur)], ['Speakers', A.list.length], ['Turns', T.length], ['Words', A.total.toLocaleString()], ['Balance (Gini)', `${A.gini.toFixed(2)} <span class="tag ${balance[0]}">${balance[1]}</span>`], ['Questions asked', A.list.reduce((a, s) => a + s.questions, 0)]]
    .map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v" style="font-size:19px">${v}</div></div>`).join('');
  $('#timeline').innerHTML = A.list.map((s) => `<div class="lane"><span title="${esc(s.name)}">${esc(s.name)}</span><div class="track">${T.filter((t) => t.speaker === s.name).map((t) => `<i style="left:${(100 * t.start) / A.dur}%;width:${Math.max(0.4, (100 * (t.end - t.start)) / A.dur)}%;background:${col[s.name]}" title="${fmtTime(t.start)} ${esc(t.text.slice(0, 80))}"></i>`).join('')}</div></div>`).join('') + `<div class="small muted row between" style="margin-left:98px"><span>0:00</span><span>${fmtTime(A.dur / 2)}</span><span>${fmtTime(A.dur)}</span></div>`;
  $('#share').innerHTML = A.list.map((s) => `<div class="share-row"><span>${esc(s.name)}</span><div class="bar"><span style="width:${s.share * 100}%;background:${col[s.name]}"></span></div><b class="mono" style="text-align:right">${Math.round(s.share * 100)}%</b></div>`).join('') + `<p class="small muted">An even split would be ${Math.round(100 / A.list.length)}% each.</p>`;
  $('#terms').innerHTML = keywords(T, 12).map((k) => `<span class="term">${esc(k.word)}<b>${k.count}</b></span>`).join('') || '<span class="muted small">Not enough text.</span>';
  $('#dyn').innerHTML = `<table><tr><th>Speaker</th><th>Turns</th><th>Avg words</th><th>Longest</th><th>Questions</th><th>Interrupts</th><th>Got cut off</th><th>Fillers</th></tr>${A.list.map((s) => `<tr><td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${col[s.name]}"></span> ${esc(s.name)}</td><td>${s.turns}</td><td>${Math.round(s.words / s.turns)}</td><td>${s.longest}</td><td>${s.questions}</td><td>${s.interrupts}</td><td>${s.interrupted}</td><td>${s.fillers}</td></tr>`).join('')}</table>`;
}
$('#analyze').onclick = () => {
  const m = cur();
  m.text = $('#tx').value; m.title = $('#mTitle').value.trim() || 'Untitled meeting'; m.date = $('#mDate').value || todayISO();
  delete m._turns;
  if (!turnsOf(m).length) return toast('No speaker turns found. Use "Name: text" lines.', 'err');
  persist(); renderAnalysis(); renderMinutes();
  toast('Saved');
};
$('#newMeeting').onclick = () => { const m = { id: uid(), title: 'New meeting', date: todayISO(), text: '', minutes: null }; meetings.unshift(m); curId = m.id; save(); persist(); loadEditor(); renderAnalysis(); $('#tx').focus(); };
$('#file').onchange = async (e) => { const f = e.target.files[0]; if (f) { $('#tx').value = await f.text(); $('#mTitle').value = f.name.replace(/\.\w+$/, ''); $('#analyze').click(); } e.target.value = ''; };

/* ================= minutes ================= */
function normalizeMinutes(raw, date) {
  return {
    title: raw.title || cur().title, summary: raw.summary || [], risks: raw.risks || [], next_agenda: raw.next_agenda || [],
    decisions: (raw.decisions || []).map((d) => (typeof d === 'string' ? { text: d } : d)),
    open_questions: (raw.open_questions || []).map((q) => (typeof q === 'string' ? { text: q } : q)),
    action_items: (raw.action_items || []).map((a) => Object.assign({ id: uid(), done: false }, a, { dueDate: a.dueDate || resolveDue(a.due, date) })),
  };
}
async function mineAI() {
  const m = cur(), T = turnsOf(m), A = analyzeTurns(T);
  const raw = await AI.chat([
    { role: 'system', content: `You are an expert chief-of-staff writing meeting minutes. Use ONLY what is in the transcript; never invent owners or dates. Relative dates ("Friday") stay as said. Return JSON:
{"title":"short meeting title","summary":["3-5 bullet points"],"decisions":[{"text":"","quote":"short supporting quote"}],"action_items":[{"task":"","owner":"name or Unassigned","due":"as stated or empty","quote":""}],"open_questions":[""],"risks":[""],"next_agenda":[""]}` },
    { role: 'user', content: `Speakers: ${A.list.map((s) => s.name).join(', ')}\n\n${T.map((t) => `[${fmtTime(t.start)}] ${t.speaker}: ${t.text}`).join('\n').slice(0, 24000)}` },
  ], { json: true, temperature: 0.2, maxTokens: 2500, demo: () => (m.text === SAMPLE_TRANSCRIPT ? DEMO_MINUTES : Object.assign({ title: m.title, summary: [] }, extractLocal(T, m.date))) });
  m.minutes = normalizeMinutes(raw, m.date);
  m.minutes.source = AI.mode() === 'demo' ? 'sample' : 'model';
  persist(); renderMinutes();
}
function mineLocal() {
  const m = cur();
  m.minutes = normalizeMinutes(Object.assign({ title: m.title }, extractLocal(turnsOf(m), m.date)), m.date);
  m.minutes.source = 'rules';
  persist(); renderMinutes();
  toast(`Found ${m.minutes.action_items.length} action items and ${m.minutes.decisions.length} decisions`);
}
function renderMinutes() {
  const m = cur(), M = m.minutes, box = $('#minutes');
  $('#minTitle').textContent = m.title;
  $('#minSub').textContent = `${m.date}${M ? ` · ${{ rules: 'extracted by rules', model: 'written by the model', sample: 'sample minutes' }[M.source] || ''}` : ''}`;
  box.innerHTML = '';
  if (!M) { box.append(h('div', { class: 'empty' }, 'Extract decisions and action items from the current meeting.')); return; }
  const people = analyzeTurns(turnsOf(m)).list.map((s) => s.name);
  const ul = (xs) => h('ul', {}, xs.map((x) => h('li', {}, typeof x === 'string' ? x : x.text)));
  const actionRow = (a) => {
    const row = h('div', { class: 'ai-item' + (a.done ? ' done' : '') },
      h('input', { type: 'checkbox', checked: a.done, 'aria-label': 'Done', onchange: (e) => { a.done = e.target.checked; row.classList.toggle('done', a.done); persist(); } }),
      h('span', {}, h('input', { class: 'input', value: a.task, 'aria-label': 'Task', onchange: (e) => { a.task = e.target.value; persist(); } }), a.quote ? h('div', { class: 'quote' }, `“${a.quote}”`) : ''),
      h('span', { class: 'meta' },
        h('select', { 'aria-label': 'Owner', onchange: (e) => { a.owner = e.target.value; persist(); } }, ['Unassigned', ...people].map((p) => h('option', { selected: p === (a.owner || 'Unassigned') }, p))),
        h('input', { type: 'date', value: a.dueDate || '', 'aria-label': 'Due date', onchange: (e) => { a.dueDate = e.target.value; persist(); } }),
        h('button', { class: 'btn ghost sm', 'aria-label': 'Remove', onclick: () => { M.action_items = M.action_items.filter((x) => x !== a); persist(); renderMinutes(); } }, '×')));
    return row;
  };
  box.append(
    h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, M.title || 'Minutes'), h('div', { class: 'row' },
      h('button', { class: 'btn sm', onclick: (e) => busy(e.currentTarget, email) }, 'Follow-up email'),
      h('button', { class: 'btn sm ghost', onclick: () => download(`${m.title.replace(/\W+/g, '-')}.md`, minutesMarkdown(Object.assign({ date: m.date }, M), analyzeTurns(turnsOf(m))), 'text/markdown') }, 'Export .md'))),
    M.summary.length ? [h('h3', { style: 'margin-top:14px' }, 'Summary'), h('div', { class: 'prose' }, ul(M.summary))] : '',
    h('h3', {}, `Decisions (${M.decisions.length})`),
    M.decisions.length ? h('div', {}, M.decisions.map((d) => h('div', { style: 'margin-bottom:10px' }, h('b', {}, 'Decided: '), d.text, d.quote ? h('div', { class: 'quote' }, `“${d.quote}”`) : ''))) : h('p', { class: 'muted small' }, 'None found.'),
    h('div', { class: 'row between' }, h('h3', {}, `Action items (${M.action_items.length})`), h('button', { class: 'btn sm ghost', onclick: () => { M.action_items.push({ id: uid(), task: 'New action', owner: 'Unassigned', done: false }); persist(); renderMinutes(); } }, 'Add')),
    h('div', {}, M.action_items.map(actionRow)),
    M.open_questions.length ? [h('h3', { style: 'margin-top:12px' }, 'Open questions'), h('div', { class: 'prose' }, ul(M.open_questions))] : '',
    M.risks.length ? [h('h3', {}, 'Risks'), h('div', { class: 'prose' }, ul(M.risks))] : '',
    M.next_agenda.length ? [h('h3', {}, 'Next meeting agenda'), h('div', { class: 'prose' }, ul(M.next_agenda))] : '',
    h('div', { id: 'emailOut', class: 'prose', style: 'margin-top:12px' }));
}
async function email() {
  const m = cur(), M = m.minutes, out = $('#emailOut');
  out.innerHTML = '<pre style="white-space:pre-wrap"></pre>';
  const pre = out.firstChild;
  const text = await AI.chat([
    { role: 'system', content: 'Write a crisp follow-up email to all attendees from the meeting organizer: subject line, 2-sentence recap, decisions, action items as "Owner: task (due)", and a closing line. Plain text, under 200 words.' },
    { role: 'user', content: JSON.stringify(M) },
  ], { temperature: 0.4, onToken: (_, acc) => { pre.textContent = acc; }, demo: `Subject: Recap: ${M.title}\n\nHi all, thanks for today. Here is what we agreed and who is doing what.\n\nDecisions\n${M.decisions.map((d) => '- ' + d.text).join('\n') || '- none'}\n\nAction items\n${M.action_items.map((a) => `- ${a.owner || 'Unassigned'}: ${a.task}${a.dueDate ? ` (${a.dueDate})` : ''}`).join('\n')}\n${M.open_questions.length ? `\nStill open\n${M.open_questions.map((q) => '- ' + q.text).join('\n')}\n` : ''}\nReply if I missed anything.` });
  pre.textContent = text;
}
$('#mine').onclick = (e) => busy(e.currentTarget, mineAI);
$('#localMine').onclick = mineLocal;

/* ================= actions ================= */
function allActions() {
  return meetings.flatMap((m) => (m.minutes?.action_items || []).map((a) => Object.assign(a, { meeting: m.title, date: m.date, meetingId: m.id })));
}
function renderActions() {
  const all = allActions(), t = todayISO(), owners = [...new Set(all.map((a) => a.owner || 'Unassigned'))].sort();
  const sel = $('#aOwner'), keep = sel.value;
  sel.innerHTML = '<option value="">Everyone</option>' + owners.map((o) => `<option>${esc(o)}</option>`).join('');
  sel.value = owners.includes(keep) ? keep : '';
  const st = $('#aStatus').value, owner = sel.value;
  const list = all.filter((a) => (!owner || (a.owner || 'Unassigned') === owner) && (st === '' || (st === 'done' ? a.done : st === 'open' ? !a.done : !a.done && a.dueDate && a.dueDate < t)))
    .sort((a, b) => (a.done - b.done) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  $('#aCount').textContent = `${all.filter((a) => !a.done).length} open · ${all.filter((a) => !a.done && a.dueDate && a.dueDate < t).length} overdue`;
  const tb = $('#aTable');
  tb.innerHTML = '';
  tb.append(h('tr', {}, ['', 'Task', 'Owner', 'Due', 'Meeting'].map((x) => h('th', {}, x))));
  if (!list.length) tb.append(h('tr', {}, h('td', { colspan: 5, class: 'muted' }, all.length ? 'Nothing matches.' : 'Extract minutes from a meeting to start tracking action items.')));
  list.forEach((a) => tb.append(h('tr', {},
    h('td', {}, h('input', { type: 'checkbox', checked: a.done, 'aria-label': 'Done', onchange: (e) => { a.done = e.target.checked; persist(); renderActions(); } })),
    h('td', { style: a.done ? 'text-decoration:line-through;color:var(--muted)' : '' }, a.task),
    h('td', {}, a.owner || 'Unassigned'),
    h('td', { class: !a.done && a.dueDate && a.dueDate < t ? 'overdue' : '' }, a.dueDate || a.due || '—'),
    h('td', {}, h('a', { href: '#/minutes', onclick: () => { curId = a.meetingId; save(); loadEditor(); renderAnalysis(); renderMinutes(); } }, `${a.meeting} (${a.date})`)))));
}
$('#aOwner').onchange = renderActions;
$('#aStatus').onchange = renderActions;
$('#aCsv').onclick = () => download('action-items.csv', actionsCSV(allActions()), 'text/csv');

/* ================= meetings ================= */
function renderMeetings() {
  const sorted = meetings.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  $('#mSummary').textContent = `${meetings.length} meeting${meetings.length === 1 ? '' : 's'} saved in this browser`;
  const list = $('#mList');
  list.innerHTML = '';
  sorted.forEach((m) => {
    const T = turnsOf(m), A = T.length ? analyzeTurns(T) : null;
    list.append(h('div', { class: 'meet-row' + (m.id === curId ? ' cur' : '') },
      h('div', {}, h('b', {}, m.title), h('div', { class: 'small muted' }, `${m.date} · ${A ? `${fmtTime(A.dur)} · ${A.list.length} people · ` : ''}${m.minutes ? `${m.minutes.action_items.length} actions` : 'no minutes yet'}`)),
      h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { curId = m.id; save(); loadEditor(); renderAnalysis(); renderMinutes(); Router.go('analyze'); } }, 'Open'),
        h('button', { class: 'btn ghost sm danger', onclick: () => { if (!confirm(`Delete "${m.title}"?`)) return; meetings = meetings.filter((x) => x !== m); if (!meetings.length) meetings.push({ id: uid(), title: 'New meeting', date: todayISO(), text: '', minutes: null }); if (curId === m.id) curId = meetings[0].id; save(); persist(); renderMeetings(); loadEditor(); renderAnalysis(); } }, 'Delete'))));
  });
  const people = {}, rows = sorted.slice().reverse().filter((m) => turnsOf(m).length);
  rows.forEach((m) => analyzeTurns(turnsOf(m)).list.forEach((s) => { (people[s.name] = people[s.name] || {})[m.id] = s.share; }));
  const names = Object.keys(people).sort((a, b) => Object.keys(people[b]).length - Object.keys(people[a]).length).slice(0, 8);
  $('#trend').innerHTML = rows.length < 2 ? '<div class="empty">Save two or more meetings to compare participation over time.</div>' : `<div class="table-wrap"><table><tr><th>Person</th>${rows.map((m) => `<th title="${esc(m.title)}">${esc(m.date.slice(5))}</th>`).join('')}</tr>${names.map((n) => `<tr><td>${esc(n)}</td>${rows.map((m) => `<td class="mono">${people[n][m.id] != null ? Math.round(people[n][m.id] * 100) + '%' : '—'}</td>`).join('')}</tr>`).join('')}</table></div>`;
}

/* ================= search ================= */
function renderSearch() {
  const q = $('#q').value.trim(), box = $('#results');
  box.innerHTML = '';
  if (!q) { $('#qCount').textContent = ''; return; }
  const hits = searchMeetings(meetings.map((m) => ({ id: m.id, title: m.title, date: m.date, turns: turnsOf(m) })), q);
  $('#qCount').textContent = `${hits.length} match${hits.length === 1 ? '' : 'es'}`;
  const re = new RegExp('(' + q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  hits.slice(0, 60).forEach((x) => box.append(h('div', { class: 'hit', onclick: () => { curId = x.meeting; save(); loadEditor(); renderAnalysis(); renderMinutes(); Router.go('analyze'); } },
    h('div', { class: 'small muted' }, `${x.title} · ${x.date} · ${fmtTime(x.at)} · ${x.speaker}`),
    (() => { const d = h('div', { style: 'margin-top:4px' }); d.innerHTML = esc(x.text).replace(re, '<mark>$1</mark>'); return d; })())));
}
$('#q').oninput = renderSearch;

/* ================= boot ================= */
Router.on('minutes', renderMinutes);
Router.on('actions', renderActions);
Router.on('meetings', renderMeetings);
save();
persist();
loadEditor();
renderAnalysis();
renderMinutes();
