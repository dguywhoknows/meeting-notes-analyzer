const turns = () => parseTranscript(SAMPLE_TRANSCRIPT);

test('time helpers', () => {
  assert.eq(toSec('01:02:03'), 3723); assert.eq(toSec('02:03'), 123); assert.eq(toSec('00:00:01.500'), 1.5);
  assert.eq(fmtTime(3723), '1:02:03'); assert.eq(fmtTime(65), '1:05');
});

test('parseTranscript reads timestamped speaker lines', () => {
  const t = turns();
  assert.eq(t.length, 19);
  assert.deepEq([t[0].speaker, t[0].start, t[0].end], ['Priya', 5, 18]);
  assert.eq(t[18].speaker, 'Priya');
  const merged = parseTranscript('Ana: one two three\ncontinued here\nAna: more\nBen: hi there');
  assert.eq(merged.length, 2);
  assert.eq(merged[0].text, 'one two three continued here more');
  assert.near(merged[0].end, (6 / 150) * 60, 1e-9);
});

test('parseTranscript reads WebVTT voice tags and SRT', () => {
  const vtt = parseTranscript('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<v Ana>Hello there.\n\n00:00:04.500 --> 00:00:06.000\n<v Ana>Still me.\n\n00:00:06.000 --> 00:00:08.000\n<v Ben>Hi Ana.');
  assert.deepEq(vtt.map((x) => [x.speaker, x.start, x.end]), [['Ana', 1, 6], ['Ben', 6, 8]]);
  assert.eq(vtt[0].text, 'Hello there. Still me.');
  const srt = parseTranscript('1\n00:00:01,000 --> 00:00:02,500\nCara: Hi.\n\n2\n00:00:03,000 --> 00:00:04,000\nDev: Hello.');
  assert.deepEq(srt.map((x) => [x.speaker, x.end]), [['Cara', 2.5], ['Dev', 4]]);
});

test('participation: gini, interruptions, fillers', () => {
  assert.eq(gini([0.5, 0.5]), 0); assert.eq(gini([1, 0]), 0.5); assert.eq(gini([1]), 0);
  const a = analyzeTurns(turns()), by = Object.fromEntries(a.list.map((s) => [s.name, s]));
  assert.eq(a.list.length, 4);
  assert.near(a.list.reduce((s, x) => s + x.share, 0), 1, 1e-9);
  assert.deepEq([by.Jen.interrupts, by.Marcus.interrupted], [2, 2]);
  assert.eq(by.Tom.fillers, 2);
  assert.eq(a.dur, turns()[18].end);
});

test('keywords ranks meeting-specific terms', () => {
  const k = keywords(turns(), 6).map((x) => x.word);
  assert.eq(k[0], 'sso');
  assert.ok(k.includes('checklist'));
  assert.ok(!k.includes('the') && !k.includes('um'));
});

test('extractLocal finds commitments, requests, decisions and open questions', () => {
  const x = extractLocal(turns(), '2026-10-08');
  assert.deepEq(x.action_items.map((a) => [a.owner, a.task]), [
    ['Marcus', 'Have a testable build by Wednesday'],
    ['Jen', 'Book the sessions for Thursday and Friday'],
    ['Tom', "Confirm with Northwind by Friday and tell us if it's a dealbreaker"],
    ['Marcus', 'Add the five core events'],
    ['Tom', 'Bring two pricing options to that meeting'],
    ['Priya', 'Send the recap'],
  ]);
  assert.deepEq(x.action_items.slice(0, 3).map((a) => a.dueDate), ['2026-10-14', '2026-10-15', '2026-10-09']);
  assert.deepEq(x.decisions.map((d) => d.text), ['Beta ships on the 21st with the onboarding checklist, SSO moves to version 1.1']);
  assert.deepEq(x.open_questions.map((q) => q.text), ['Do we charge or not?']);
});

test('resolveDue handles weekdays, relative phrases and dates', () => {
  const d = (t) => resolveDue(t, '2026-10-08');
  assert.eq(d('tomorrow'), '2026-10-09');
  assert.eq(d('by Friday'), '2026-10-09');
  assert.eq(d('next Friday'), '2026-10-16');
  assert.eq(d('Thursday'), '2026-10-15');
  assert.eq(d('next week'), '2026-10-12');
  assert.eq(d('end of week'), '2026-10-09');
  assert.eq(d('end of month'), '2026-10-31');
  assert.eq(d('by the 21st'), '2026-10-21');
  assert.eq(d('the 5th'), '2026-11-05');
  assert.eq(d('Nov 3rd'), '2026-11-03');
  assert.eq(d('Oct 2'), '2027-10-02');
  assert.eq(d(''), null); assert.eq(d('whenever'), null);
});

test('search and exports', () => {
  const m = [{ id: 'm1', title: 'Beta', date: '2026-10-08', turns: turns() }];
  const r = searchMeetings(m, 'pricing options');
  assert.eq(r.length, 1); assert.eq(r[0].speaker, 'Tom');
  assert.eq(searchMeetings(m, '').length, 0);
  const md = minutesMarkdown({ title: 'Beta', date: '2026-10-08', decisions: [{ text: 'Ship' }], action_items: [{ owner: 'Tom', task: 'Call', dueDate: '2026-10-09', done: true }] });
  assert.ok(md.startsWith('# Beta (2026-10-08)'));
  assert.ok(md.includes('- [x] **Tom**: Call _(due 2026-10-09)_'));
  assert.eq(actionsCSV([{ meeting: 'Beta', date: 'd', owner: 'Tom', task: 'Say "hi"', done: false }]), 'meeting,date,owner,task,due,done\n"Beta","d","Tom","Say ""hi""","","no"');
});
