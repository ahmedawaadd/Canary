#!/usr/bin/env node
// Canary Stop hook — the deterministic verification layer.
//
// WHY: the skill asks the model to emit [🐦:N], but the model that drops the
// bird is exactly the one whose context is degrading. Self-checking can't be
// trusted there. This runs OUTSIDE the model, after every turn, so the check
// never depends on the thing being checked.
//
// WHAT: read the finished transcript, confirm the final assistant message
// carries [🐦:N] and that N advanced by 1. If the bird is missing, repeated,
// reset, or skipped, surface a warning to the user — caught even when the
// model itself forgot.

const fs = require('fs');

// Read the hook payload Claude Code pipes in on stdin.
function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

// systemMessage surfaces a one-line warning to the user without blocking the
// stop. Emit and exit — one warning per turn is enough.
function warn(msg) {
  process.stdout.write(JSON.stringify({ systemMessage: msg }));
  process.exit(0);
}

const TOKEN = /\[🐦:(\d+)\]/g;

let input;
try { input = JSON.parse(readStdin() || '{}'); } catch { process.exit(0); }

// No transcript -> nothing to verify. Stay silent rather than cry wolf.
const path = input.transcript_path;
if (!path || !fs.existsSync(path)) process.exit(0);

// The transcript is JSONL. Walk it and pull the canary counter from each
// assistant message, in order. null = an assistant turn with no bird
// (intermediate tool-call rounds legitimately have none).
const counters = [];
for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let ev; try { ev = JSON.parse(line); } catch { continue; }
  if (ev.type !== 'assistant' || !ev.message) continue;

  const content = ev.message.content;
  const text = Array.isArray(content)
    ? content.filter(b => b.type === 'text').map(b => b.text).join('')
    : (typeof content === 'string' ? content : '');
  if (!text) continue;

  // Last token in the message is the canonical one for that turn.
  const found = [];
  let m; TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text)) !== null) found.push(Number(m[1]));
  counters.push(found.length ? found[found.length - 1] : null);
}

if (counters.length === 0) process.exit(0);

const last = counters[counters.length - 1];

// Primary failure: the latest response shipped with no bird at all.
if (last === null) {
  warn('🐦 Canary missing — last response had no [🐦:N]. Context may be degrading; verify the output.');
}

// Compare against the previous turn that did carry a bird, skipping the
// nulls from intermediate tool-call rounds.
const prevBird = [...counters.slice(0, -1)].reverse().find(c => c !== null);
if (prevBird != null) {
  if (last === prevBird) {
    warn(`🐦 Canary stuck at [🐦:${last}] — counter not advancing. Context may be degrading.`);
  } else if (last < prevBird) {
    warn(`🐦 Canary reset (${prevBird} -> ${last}) — earlier context was dropped.`);
  } else if (last > prevBird + 1) {
    warn(`🐦 Canary skipped (${prevBird} -> ${last}) — turns may be missing from context.`);
  }
}

process.exit(0);
