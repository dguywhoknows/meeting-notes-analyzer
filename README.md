# meeting-notes-analyzer

[![tests](https://github.com/dguywhoknows/meeting-notes-analyzer/actions/workflows/tests.yml/badge.svg)](https://github.com/dguywhoknows/meeting-notes-analyzer/actions/workflows/tests.yml)

Turn a meeting transcript into minutes, decisions and owned action items, plus speaker analytics: talk time, interruptions, balance and a timeline.

Live: https://dguywhoknows.github.io/meeting-notes-analyzer/

## Overview

Paste a transcript or drop in a Zoom/Teams WebVTT or SRT file. A tolerant parser handles timestamps, multi-line turns and <v Speaker> tags, and estimates timing from speaking rate when timestamps are missing. Local analytics show how the meeting actually went: a speaker-lane timeline, talk share, a Gini balance score, turn lengths, questions asked, interruptions (who cut off whom) and filler words. The AI then writes grounded minutes: summary, decisions with supporting quotes, action items with owner and due date exactly as stated, open questions, risks and the next agenda. It can also draft the follow-up email.

## Pages

- **Analyze**
- **Minutes**
- **Actions**
- **Meetings**
- **Search**
- **Settings**

## Features

- Transcript parser: plain 'Name: text', [hh:mm:ss] stamps, WebVTT/SRT with <v> voice tags
- Speaker timeline lanes, talk-share bars, Gini-coefficient balance indicator
- Dynamics table: turns, avg/longest turn, questions, interruptions given/received, filler words
- AI minutes grounded with quotes; never invents owners or dates
- Checkable action items; export Markdown minutes + CSV action items
- Streaming follow-up email draft
- Rule-based extraction that works without a model: commitments ("I'll …"), requests addressed to someone ("Tom, can you …"), decisions and unanswered or parked questions, with owners taken from the speaker or addressee
- Due-date resolution: weekdays, next <weekday>, tomorrow, next week, end of week/month, "the 21st" and month-day phrases become real dates relative to the meeting
- Minutes page: editable action items (task, owner, due date, done), decisions with supporting quotes, follow-up email and Markdown export
- Actions page: one tracker across every saved meeting with owner and status filters, overdue highlighting and CSV export
- Meetings page: a library of saved meetings and a participation table showing each person's talk share over time
- Search page: full-text search across every saved transcript with highlighted matches
- Key terms per meeting ranked by TF-IDF across turns

## How it works

LLM calls are used for:

- Structured minutes extraction (JSON) with supporting quotes
- Follow-up email generation

Everything else (parsing, timing estimation, speaker analytics, timeline rendering, exports) runs locally in the browser.

## Getting started

No build step and no dependencies. Serve the folder with any static server:

```bash
git clone https://github.com/dguywhoknows/meeting-notes-analyzer.git
cd meeting-notes-analyzer
python -m http.server 8000
```

Then open http://localhost:8000.

### Configuration

Without an API key the app runs in demo mode with sample model output. To use a live model, open
**Settings → Configure provider** and paste a key for [Groq](https://console.groq.com/keys) or
[OpenRouter](https://openrouter.ai/keys). The key is stored in this browser's `localStorage` (namespaced to
this app) and is sent only to the selected provider.

## Testing

`src/core.js` holds the app's logic as pure functions and is covered by 8 unit tests.

```bash
node tests/run-node.js        # CI runs this on every push
```

Or open `tests/index.html` in a browser ([live](https://dguywhoknows.github.io/meeting-notes-analyzer/tests/)).

## Project structure

```
index.html           markup for every page
src/app.js           UI, page wiring and event handlers
src/core.js          pure logic with no DOM access (unit-tested)
src/demo.js          sample responses used when no API key is configured
src/lib/ai.js        LLM client: Groq / OpenRouter, streaming, JSON mode, retries
src/lib/dom.js       DOM helpers, namespaced storage, markdown renderer
src/lib/router.js    hash router and the Settings page
styles/base.css      design tokens and shared components
styles/app.css       app-specific styles
tests/               unit tests (browser runner + Node runner for CI)
```

## Tech

- WebVTT/SRT parsing
- Gini coefficient for participation balance
- Overlap/trailing-dash interruption heuristics
- Parsing, participation metrics, extraction, date resolution and search in src/core.js covered by unit tests run in the browser and in CI
- Vanilla JavaScript, no framework or bundler
- Deployed with GitHub Pages

## License

MIT
