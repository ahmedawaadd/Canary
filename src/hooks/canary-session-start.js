#!/usr/bin/env node
//
// BREAKING CHANGE vs v1:
//   v1 asked the model to derive the counter by scanning the transcript.
//   That breaks at high turn counts (arithmetic drift) and after context
//   summarization (the prior [🐦:k] scrolls out of view). This hook
//   eliminates both failure modes by making the hook the sole source of
//   truth for the counter — the model never calculates it.
//
// WHAT: initialize a fresh per-session state file on session start.
//   Subsequent hooks read/write this file instead of trusting the model.

'use strict';
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const crypto = require('crypto');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

// Derive a stable file path from the working directory so all hooks in this
// session share the same state file without needing to pass session IDs
// between processes.
function stateFile(cwd) {
  const hash = crypto.createHash('sha1').update(cwd || '').digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `canary-${hash}.json`);
}

let input;
try { input = JSON.parse(readStdin() || '{}'); } catch { process.exit(0); }

const cwd = input.cwd || process.cwd();

// expected: the token number the model should emit on the NEXT turn.
// Starts at 1 for a fresh session.
fs.writeFileSync(stateFile(cwd), JSON.stringify({ expected: 1, cwd }), 'utf8');

process.exit(0);
