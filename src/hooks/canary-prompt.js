#!/usr/bin/env node
//
// BREAKING CHANGE vs v1:
//   v1 relied on the SKILL.md instruction "find the highest [🐦:k] in the
//   transcript and emit k+1". That is model-side arithmetic that fails under
//   context pressure — exactly when the monitor matters most.
//
//   This hook runs before every model turn (UserPromptSubmit) and injects the
//   exact token into the system prompt. The model's only job is to copy it
//   verbatim — no arithmetic, no memory of prior turns required.
//
// WHAT: read the expected counter from the session state file, then output a
//   systemMessage that tells the model precisely what token to emit this turn.
//   Self-heals (initialises state) if the session-start hook missed or the
//   state file was deleted.

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

let input;
try { input = JSON.parse(readStdin() || '{}'); } catch { process.exit(0); }

const cwd  = input.cwd || process.cwd();
const file = stateFile(cwd);

let state;
try {
  state = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  // State file missing — initialise rather than silently dropping the monitor.
  state = { expected: 1, cwd };
  fs.writeFileSync(file, JSON.stringify(state), 'utf8');
}

// Inject the exact token as a system message so the model has no ambiguity
// about what to write. The Stop hook will validate this exact value.
const token = `[🐦:${state.expected}]`;
process.stdout.write(JSON.stringify({
  systemMessage: `Canary: end this response with exactly: ${token} — on its own line, after all content, never inside a code block.`
}));

process.exit(0);
