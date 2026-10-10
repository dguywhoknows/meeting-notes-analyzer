/* core.js — transcript parsing, participation analytics, rule-based extraction of decisions and action items, due-date resolution and search (pure, unit-tested). */

function toSec(s) {
  var p = String(s).split(/[:.,]/).map(Number);
  if (p.length >= 4) return p[0] * 3600 + p[1] * 60 + p[2] + p[3] / 1000;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  return p[0] * 60 + (p[1] || 0);
}
function fmtTime(s) { s = Math.max(0, Math.floor(s)); var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
function wordCount(t) { return (String(t).match(/[\p{L}\p{N}'’-]+/gu) || []).length; }

/* Accepts "Name: text", "[00:03:12] Name: text", WebVTT (with <v Name> voice tags) and SRT. Consecutive lines by one speaker merge. */
function parseTranscript(text) {
  text = String(text).replace(/\r/g, '').replace(/^﻿?WEBVTT.*\n/, '');
  var turns = [];
  var push = function (speaker, t, start, end) {
    t = t.trim();
    if (!t) return;
    var last = turns[turns.length - 1];
    if (last && last.speaker === speaker && (start == null || last.end == null || start - last.end < 2)) { last.text += ' ' + t; if (end != null) last.end = end; return; }
    turns.push({ speaker: speaker || 'Unknown', text: t, start: start, end: end });
  };
  if (/-->/.test(text)) {
    text.split(/\n\s*\n/).forEach(function (block) {
      var m = block.match(/(\d{1,2}:?\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:?\d{2}:\d{2}[.,]\d{3})/);
      if (!m) return;
      var body = block.slice(block.indexOf(m[0]) + m[0].length).trim().replace(/\n/g, ' ');
      var sp = (body.match(/^<v\s+([^>]+)>/) || [])[1];
      body = body.replace(/<[^>]+>/g, '');
      if (!sp) { var mm = body.match(/^([A-Z][\w .'-]{0,30}):\s+/); if (mm) { sp = mm[1]; body = body.slice(mm[0].length); } }
      push(sp || (turns.length ? turns[turns.length - 1].speaker : null), body, toSec(m[1]), toSec(m[2]));
    });
  } else {
    var cur = null;
    text.split('\n').forEach(function (line) {
      var m = line.match(/^\s*[\[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s*[-–]?\s*([A-Z][\w .'-]{0,30}?)\s*:\s+(.*)$/) || line.match(/^\s*()([A-Z][\w .'-]{0,30}?)\s*:\s+(.*)$/);
      if (m) { cur = m[2].trim(); push(cur, m[3], m[1] ? toSec(m[1]) : null, null); }
      else if (line.trim() && cur) turns[turns.length - 1].text += ' ' + line.trim();
    });
  }
  var clock = 0;
  turns.forEach(function (t, i) {
    t.words = wordCount(t.text);
    if (t.start == null) t.start = clock;
    if (t.end == null) t.end = turns[i + 1] && turns[i + 1].start != null ? turns[i + 1].start : t.start + (t.words / 150) * 60;
    if (t.end <= t.start) t.end = t.start + (t.words / 150) * 60;
    clock = t.end;
  });
  return turns;
}

/* ---------- participation ---------- */
var FILLERS = /\b(um+|uh+|erm|you know|i mean|sort of|kind of|basically|actually|literally)\b/gi;
function gini(shares) {
  var xs = shares.slice().sort(function (a, b) { return a - b; }), n = xs.length, sum = xs.reduce(function (a, b) { return a + b; }, 0);
  if (n < 2 || !sum) return 0;
  return xs.reduce(function (acc, x, i) { return acc + (2 * (i + 1) - n - 1) * x; }, 0) / (n * sum);
}
function analyzeTurns(turns) {
  var sp = {};
  turns.forEach(function (t, i) {
    var s = sp[t.speaker] || (sp[t.speaker] = { name: t.speaker, words: 0, secs: 0, turns: 0, longest: 0, questions: 0, interrupted: 0, interrupts: 0, fillers: 0 });
    s.words += t.words; s.secs += t.end - t.start; s.turns++; s.longest = Math.max(s.longest, t.words);
    s.questions += (t.text.match(/\?/g) || []).length;
    s.fillers += (t.text.match(FILLERS) || []).length;
    var prev = turns[i - 1];
    if (prev && prev.speaker !== t.speaker && (/(—|--|-|…|\.\.\.)\s*$/.test(prev.text) || t.start < prev.end - 0.5)) { s.interrupts++; sp[prev.speaker].interrupted++; }
  });
  var list = Object.keys(sp).map(function (k) { return sp[k]; }).sort(function (a, b) { return b.words - a.words; });
  var total = list.reduce(function (a, s) { return a + s.words; }, 0) || 1;
  list.forEach(function (s) { s.share = s.words / total; });
  return { list: list, gini: gini(list.map(function (s) { return s.share; })), dur: turns.reduce(function (a, t) { return Math.max(a, t.end); }, 0), total: total };
}

/* ---------- keywords ---------- */
var STOP = 'a an and are as at be but by can could did do does for from had has have he her his i if in is it its just let lets me my no not of on or our so that the their them then there they this to too up us was we were what when where which who will with would you your yeah okay ok sure think really going get got go one two also about all any been more some than very like want need well right yes i\'ll i\'d that\'s it\'s we\'re don\'t can\'t let\'s i\'ve we\'ve'.split(' ');
function tokensOf(t) { return (String(t).toLowerCase().match(/[\p{L}][\p{L}'’-]+/gu) || []).filter(function (w) { return w.length > 2 && STOP.indexOf(w) < 0 && !FILLERS.test(w); }); }
/* TF-IDF over turns: words that are frequent in this meeting but concentrated in few turns. */
function keywords(turns, n) {
  var df = {}, tf = {};
  turns.forEach(function (t) { var seen = {}; tokensOf(t.text).forEach(function (w) { tf[w] = (tf[w] || 0) + 1; if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } }); });
  FILLERS.lastIndex = 0;
  var N = turns.length || 1;
  return Object.keys(tf).filter(function (w) { return tf[w] > 1; }).map(function (w) { return { word: w, score: tf[w] * Math.log(1 + N / df[w]), count: tf[w] }; })
    .sort(function (a, b) { return b.score - a.score || a.word.localeCompare(b.word); }).slice(0, n || 10);
}

/* ---------- rule-based extraction ---------- */
var WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function isoDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
/* Turn "Friday", "tomorrow", "next week", "end of month", "the 21st" or "Oct 21" into a date relative to the meeting. */
function resolveDue(text, meetingDate) {
  var t = String(text || '').toLowerCase(), base = new Date(meetingDate + 'T12:00:00'), d = new Date(base), m;
  if (!t.trim() || isNaN(base)) return null;
  if (/\btoday\b|\bend of (the )?day\b|\beod\b/.test(t)) return isoDay(d);
  if (/\btomorrow\b/.test(t)) { d.setDate(d.getDate() + 1); return isoDay(d); }
  if (/\bnext week\b/.test(t)) { d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return isoDay(d); }
  if (/\bend of (the )?week\b/.test(t)) { d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return isoDay(d); }
  if (/\bend of (the )?month\b/.test(t)) return isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  for (var i = 0; i < 7; i++) {
    if (new RegExp('\\b' + WEEKDAYS[i] + '\\b').test(t)) {
      var diff = (i - d.getDay() + 7) % 7 || 7;
      if (new RegExp('\\bnext\\s+' + WEEKDAYS[i]).test(t)) diff += 7;
      d.setDate(d.getDate() + diff);
      return isoDay(d);
    }
  }
  if ((m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(st|nd|rd|th)?\b/))) {
    var x = new Date(d.getFullYear(), MONTHS.indexOf(m[1]), +m[2]);
    if (x < base) x.setFullYear(x.getFullYear() + 1);
    return isoDay(x);
  }
  if ((m = t.match(/\bthe\s+(\d{1,2})(st|nd|rd|th)\b/))) {
    var y = new Date(d.getFullYear(), d.getMonth(), +m[1]);
    if (y < base) y.setMonth(y.getMonth() + 1);
    return isoDay(y);
  }
  return null;
}
var DUE_RE = /\b(by|before|on|until|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|the \d{1,2}(?:st|nd|rd|th)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}|end of (?:the )?(?:day|week|month)|week)\b|\b(today|tomorrow|this week|next week)\b|\b(monday|tuesday|wednesday|thursday|friday)\b/i;
function sentencesOf(text) { return String(text).split(/(?<=[.!?…])\s+/).map(function (s) { return s.trim(); }).filter(Boolean); }
function cleanTask(s) {
  return s.replace(/^(okay|ok|so|yep|yes|sure|great|perfect|and|then)[,.]?\s+/i, '').replace(/^(i'll|i will|i can|i'm going to|we'll|we will)\s+/i, '').replace(/\?$/, '').replace(/[.…]+$/, '').replace(/^\w/, function (c) { return c.toUpperCase(); });
}
/*
 * Commitments ("I'll …", "I will …", "I can do that …"), requests addressed to someone ("Tom, can you …"),
 * decisions ("decision:", "we agreed", "let's go with"), and questions nobody answered.
 */
function extractLocal(turns, meetingDate) {
  var speakers = {}; turns.forEach(function (t) { speakers[t.speaker] = 1; });
  var names = Object.keys(speakers), actions = [], decisions = [], questions = [];
  turns.forEach(function (t, ti) {
    sentencesOf(t.text).forEach(function (s) {
      var due = (s.match(DUE_RE) || [])[0] || '';
      var addressed = names.find(function (n) { return new RegExp('^' + n.split(' ')[0] + ',\\s+(can|could|would|will) you\\b', 'i').test(s); });
      if (addressed) { actions.push({ task: cleanTask(s.replace(/^[^,]+,\s+(can|could|would|will) you\s+/i, '')), owner: addressed, due: due, dueDate: resolveDue(due, meetingDate), quote: s, at: t.start }); return; }
      if (/\b(i'll|i will|i'm going to|i can do that|i can take)\b/i.test(s) && !/\b(i'll|i will) be\b/i.test(s) && !/\?$/.test(s)) {
        var task = cleanTask(s.replace(/^.*?\b(i'll|i will|i'm going to|i can)\b\s*/i, ''));
        if (/^(do that|take that)\b/i.test(task)) {
          var asks = turns[ti - 1] ? sentencesOf(turns[ti - 1].text).filter(function (x) { return /\?$/.test(x); }) : [];
          if (asks.length) task = cleanTask(asks.pop().replace(/^(?:[^,]+,\s+)?(can|could|would) (we|you)\s+/i, ''));
        }
        var last = actions[actions.length - 1];
        var repeat = last && last.owner === t.speaker && t.start - last.at < 30 && turns[ti - 1] && last.at === turns[ti - 1].start;
        if (wordCount(task) >= 2 && !repeat) actions.push({ task: task, owner: t.speaker, due: due, dueDate: resolveDue(due, meetingDate), quote: s, at: t.start });
      }
      if (/\bdecision\s*:|\b(we('ve| have)? (agreed|decided)|let's go with|we're going with|final answer)\b/i.test(s)) decisions.push({ text: cleanTask(s.replace(/^.*?\b(decision\s*:|we('ve| have)? (agreed|decided)( to| that)?|let's go with|we're going with)\s*/i, '')), quote: s, at: t.start, by: t.speaker });
      if (/\?$/.test(s) && !/\b(any objections|can you|could you|right)\?$/i.test(s)) {
        var next = turns[ti + 1];
        var answered = next && next.speaker !== t.speaker && !/\?$/.test(next.text.trim()) && wordCount(next.text) > 3;
        if (!answered || /\b(park|next week|later|follow up|offline)\b/i.test(t.text + ' ' + (next ? next.text : ''))) questions.push({ text: s, by: t.speaker, at: t.start });
      }
    });
  });
  return { action_items: actions, decisions: decisions, open_questions: questions };
}

/* ---------- search + export ---------- */
function searchMeetings(meetings, query) {
  var terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  var out = [];
  meetings.forEach(function (m) {
    m.turns.forEach(function (t, i) {
      var low = t.text.toLowerCase();
      if (terms.every(function (q) { return low.indexOf(q) >= 0 || t.speaker.toLowerCase() === q; })) out.push({ meeting: m.id, title: m.title, date: m.date, index: i, speaker: t.speaker, at: t.start, text: t.text, score: terms.reduce(function (a, q) { return a + low.split(q).length - 1; }, 0) });
    });
  });
  return out.sort(function (a, b) { return b.score - a.score || (b.date || '').localeCompare(a.date || ''); });
}
function minutesMarkdown(m, analysis) {
  var s = '# ' + (m.title || 'Meeting') + (m.date ? ' (' + m.date + ')' : '') + '\n\n';
  if ((m.summary || []).length) s += '## Summary\n' + m.summary.map(function (x) { return '- ' + x; }).join('\n') + '\n\n';
  s += '## Decisions\n' + ((m.decisions || []).map(function (d) { return '- ' + d.text; }).join('\n') || '- none recorded') + '\n\n';
  s += '## Action items\n' + ((m.action_items || []).map(function (a) { return '- [' + (a.done ? 'x' : ' ') + '] **' + (a.owner || 'Unassigned') + '**: ' + a.task + (a.dueDate || a.due ? ' _(due ' + (a.dueDate || a.due) + ')_' : ''); }).join('\n') || '- none') + '\n';
  if ((m.open_questions || []).length) s += '\n## Open questions\n' + m.open_questions.map(function (q) { return '- ' + (q.text || q); }).join('\n') + '\n';
  if (analysis) s += '\n## Participation\n' + analysis.list.map(function (p) { return '- ' + p.name + ': ' + Math.round(p.share * 100) + '% of words, ' + p.turns + ' turns'; }).join('\n') + '\n';
  return s;
}
function actionsCSV(rows) {
  var q = function (x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; };
  return 'meeting,date,owner,task,due,done\n' + rows.map(function (a) { return [a.meeting, a.date, a.owner, a.task, a.dueDate || a.due, a.done ? 'yes' : 'no'].map(q).join(','); }).join('\n');
}
