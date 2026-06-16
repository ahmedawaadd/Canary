#!/usr/bin/env node
//
// BREAKING CHANGE vs v1:
//   v1 validated the bird by comparing consecutive counters it found in the
//   transcript. That approach had two false-negative failure modes:
//     1. Arithmetic drift — models miscalculate at high turn counts.
//     2. Summarisation — the prior [🐦:k] scrolls out of context, model
//        re-derives a wrong or stale number, hook fires a false alarm.
//
//   This hook instead reads the expected counter from the state file written
//   by canary-prompt.js. Validation is now: "does the last response contain
//   exactly [🐦:N] where N is what WE told it to write?" — no model arithmetic
//   involved at any stage.
//
// WHAT: after each turn (Stop event), scan the final assistant message, compare
//   the bird token against the state-file expected value, warn if wrong, then
//   increment expected for the next turn regardless of outcome.

'use strict';
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const crypto = require('crypto');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function stateFile(cwd) {
  const hash = crypto.createHash('sha1').update(cwd || '').digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `canary-${hash}.json`);
}

function warn(msg) {
  process.stdout.write(JSON.stringify({ systemMessage: msg }));
}

let input;
try { input = JSON.parse(readStdin() || '{}'); } catch { process.exit(0); }

const cwd  = input.cwd || process.cwd();
const file = stateFile(cwd);

let state;
try {
  state = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  // No state file means canary-prompt.js never ran (skill-only install, no
  // plugin hooks). Fall back silently — don't cry wolf with a false alarm.
  process.exit(0);
}

const { expected } = state;

// Read the transcript and pull text from the last assistant message only.
// Earlier turns are irrelevant — we only care whether THIS turn's token matched.
const transcriptPath = input.transcript_path;
if (!transcriptPath || !fs.existsSync(transcriptPath)) {
  // Increment and write anyway so the sequence stays valid next turn.
  fs.writeFileSync(file, JSON.stringify({ ...state, expected: expected + 1 }), 'utf8');
  process.exit(0);
}

let lastAssistantText = '';
for (const line of fs.readFileSync(transcriptPath, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let ev; try { ev = JSON.parse(line); } catch { continue; }
  if (ev.type !== 'assistant' || !ev.message) continue;
  const content = ev.message.content;
  lastAssistantText = Array.isArray(content)
    ? content.filter(b => b.type === 'text').map(b => b.text).join('')
    : (typeof content === 'string' ? content : '');
}

const TOKEN = /\[🐦:(\d+)\]/g;
const found = [];
let m; TOKEN.lastIndex = 0;
while ((m = TOKEN.exec(lastAssistantText)) !== null) found.push(Number(m[1]));

// Always increment — even on failure the sequence must stay coherent so the
// next turn's injection is correct.
fs.writeFileSync(file, JSON.stringify({ ...state, expected: expected + 1 }), 'utf8');

if (found.length === 0) {
  warn(`🐦 Canary missing — expected [🐦:${expected}] but the response had no token. Context may be degrading.`);
} else {
  const actual = found[found.length - 1];
  if (actual !== expected) {
    warn(`🐦 Canary mismatch — expected [🐦:${expected}], got [🐦:${actual}]. Context may be degrading.`);
  }
  // exact match: healthy, stay silent.
}

process.exit(0);
