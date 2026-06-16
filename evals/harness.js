#!/usr/bin/env node
//
// Canary eval harness — context flood test
//
// Proves the correlation between Canary token loss and fact forgetting.
//
// HOW IT WORKS:
//   The Canary instruction and the secret fact are both seeded in the first
//   user message — NOT in the system prompt. This means they live in the
//   message history and can be pruned away as context fills up. When the
//   sliding window drops those early messages, the model loses both the
//   bird instruction and the fact simultaneously. That's the moment we record.
//
// WHY NOT THE SYSTEM PROMPT:
//   If the Canary instruction is in the system prompt it is never pruned —
//   the bird would keep appearing even after the fact is forgotten, which
//   breaks the correlation. Embedding it in message history gives us the
//   honest worst-case demo that reflects how a skill-only install behaves
//   when Claude Code decides not to re-inject the skill.
//
// RUN:
//   ANTHROPIC_API_KEY=sk-... node evals/harness.js
//   ANTHROPIC_API_KEY=sk-... MAX_TOKENS=30000 node evals/harness.js
//
// ENV:
//   ANTHROPIC_API_KEY  — required
//   MAX_TOKENS         — sliding window ceiling in tokens (default: 25000)
//   FILLER_LINES       — log lines per filler turn (default: 60, ≈1800 tokens)
//   CHECK_EVERY        — turns between memory checks (default: 3)
//   MAX_TURNS          — hard stop (default: 60)
//   MODEL              — Anthropic model ID (default: claude-haiku-4-5-20251001)
//   SECRET             — the passphrase to plant (default: THUNDERBOLT-7829)

'use strict';

const Anthropic = require('@anthropic-ai/sdk');

// ── Config ──────────────────────────────────────────────────────────────────

const SECRET      = process.env.SECRET      || 'THUNDERBOLT-7829';
const MAX_TOKENS  = Number(process.env.MAX_TOKENS)  || 25_000;
const FILLER_LINES= Number(process.env.FILLER_LINES)|| 60;
const CHECK_EVERY = Number(process.env.CHECK_EVERY) || 3;
const MAX_TURNS   = Number(process.env.MAX_TURNS)   || 60;
const MODEL       = process.env.MODEL || 'claude-haiku-4-5-20251001';

// ── ANSI colours (safe to pipe, skip if not a TTY) ──────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
  reset:  isTTY ? '\x1b[0m'  : '',
  bold:   isTTY ? '\x1b[1m'  : '',
  dim:    isTTY ? '\x1b[2m'  : '',
  green:  isTTY ? '\x1b[32m' : '',
  red:    isTTY ? '\x1b[31m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  cyan:   isTTY ? '\x1b[36m' : '',
  grey:   isTTY ? '\x1b[90m' : '',
};

// ── Canary instruction (embedded in first message, not system prompt) ────────
//
// This is the v1 / skill-only behaviour: the instruction is part of the
// conversation history. When the sliding window prunes it, the bird stops
// appearing — the same event that makes the model forget the fact.

const CANARY_INSTRUCTION = `
CONTEXT HEALTH MONITOR — follow this throughout the conversation:
After every single response, append [🐦:N] on its own line as the very last
thing, where N increments by 1 each reply (first reply: [🐦:1], second: [🐦:2],
and so on). Never omit this token. Not in short replies, not in code-only
replies. If you cannot see any prior [🐦:k] in the conversation, reset to
[🐦:1] and write ⚠️ canary reset above it.
`.trim();

// ── Filler generator ─────────────────────────────────────────────────────────

function makeFiller(turn) {
  // Realistic-looking log output — varied enough to avoid compression artefacts
  const lines = [];
  const base   = Date.now() - (MAX_TURNS - turn) * 1000;
  for (let i = 0; i < FILLER_LINES; i++) {
    const ts     = new Date(base + i * 17).toISOString();
    const worker = `worker-${(turn * 7 + i) % 16}`;
    const batch  = Math.random().toString(36).slice(2, 10);
    const ms     = 40 + Math.floor(Math.random() * 180);
    const level  = i % 20 === 0 ? 'WARN ' : 'INFO ';
    lines.push(`[${ts}] ${level} ${worker}: batch=${batch} status=OK latency=${ms}ms`);
  }
  return (
    `System log batch #${turn} — please acknowledge receipt.\n\n` +
    '```\n' + lines.join('\n') + '\n```'
  );
}

// ── Token scanner ────────────────────────────────────────────────────────────

function findBird(text) {
  // Returns the last [🐦:N] found in text, or null.
  const matches = [...text.matchAll(/\[🐦:(\d+)\]/g)];
  if (!matches.length) return null;
  return Number(matches[matches.length - 1][1]);
}

function factPresent(text) {
  return text.toUpperCase().includes(SECRET.toUpperCase());
}

// ── Sliding window ───────────────────────────────────────────────────────────
//
// The Anthropic API returns exact input_tokens usage after each call.
// When that count approaches MAX_TOKENS, drop the oldest user+assistant pair
// (messages[0] + messages[1]) until we're back under the ceiling.
// The first pair to drop is always the setup message that contains the canary
// instruction + secret — that's intentional: it's what triggers forgetting.

function pruneMessages(messages, inputTokens) {
  let pruned = 0;
  while (inputTokens > MAX_TOKENS * 0.9 && messages.length >= 2) {
    messages.splice(0, 2); // drop oldest user+assistant pair
    inputTokens -= 2_000;  // rough estimate per pair; real usage recalculated next turn
    pruned += 2;
  }
  return pruned;
}

// ── Display ──────────────────────────────────────────────────────────────────

function header() {
  const line = '═'.repeat(60);
  console.log(`\n${c.bold}╔${line}╗${c.reset}`);
  console.log(`${c.bold}║${c.reset}  ${c.cyan}CANARY EVAL — context flood test${c.reset}${' '.repeat(27)}${c.bold}║${c.reset}`);
  console.log(`${c.bold}║${c.reset}  secret:  ${c.yellow}${SECRET}${c.reset}${' '.repeat(60 - 12 - SECRET.length)}${c.bold}║${c.reset}`);
  console.log(`${c.bold}║${c.reset}  model:   ${c.grey}${MODEL}${c.reset}${' '.repeat(60 - 12 - MODEL.length)}${c.bold}║${c.reset}`);
  console.log(`${c.bold}║${c.reset}  window:  ${c.grey}${(MAX_TOKENS/1000).toFixed(0)}k tokens${c.reset}${' '.repeat(60 - 12 - String((MAX_TOKENS/1000).toFixed(0)).length - 8)}${c.bold}║${c.reset}`);
  console.log(`${c.bold}╚${line}╝${c.reset}\n`);
  console.log(
    `${c.grey}${'turn'.padEnd(6)} ctx-tokens  bird         memory${c.reset}`
  );
  console.log(`${c.grey}${'─'.repeat(55)}${c.reset}`);
}

function logTurn({ turn, inputTokens, birdFound, expected, isCheck, remembered, pruned, label }) {
  const turnStr   = String(turn).padStart(4);
  const ctxStr    = `${(inputTokens/1000).toFixed(1)}k`.padStart(7);

  let birdStr;
  if (birdFound === null) {
    birdStr = `${c.red}✗ MISSING   ${c.reset}`;
  } else if (birdFound !== expected) {
    birdStr = `${c.yellow}⚠ [🐦:${birdFound}]≠${expected}${c.reset}`.padEnd(14);
  } else {
    birdStr = `${c.green}[🐦:${birdFound}] ✓${c.reset}`.padEnd(14);
  }

  let memStr = '';
  if (pruned > 0) memStr += `${c.yellow}⚠ pruned ${pruned} msgs${c.reset}  `;
  if (isCheck) {
    memStr += remembered
      ? `${c.green}CHECK ✅ remembered${c.reset}`
      : `${c.bold}${c.red}CHECK ❌ FORGOTTEN${c.reset}`;
  } else if (label) {
    memStr += `${c.grey}${label}${c.reset}`;
  }

  console.log(` ${turnStr}  ${ctxStr}   ${birdStr}  ${memStr}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`${c.red}Error: ANTHROPIC_API_KEY not set.${c.reset}`);
    process.exit(1);
  }

  const client = new Anthropic();
  const messages = [];
  let expected = 1;
  let totalPruned = 0;
  let factDroppedAt = null;
  let birdDroppedAt = null;
  let forgetTurn = null;

  header();

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const isCheck = turn > 1 && (turn - 1) % CHECK_EVERY === 0;

    // ── Build user message ──────────────────────────────────────────────────
    let userText;
    if (turn === 1) {
      // Seed: canary instruction + secret in the same message so they are
      // pruned together — the earliest possible warning of mutual loss.
      userText =
        CANARY_INSTRUCTION +
        `\n\nNow: store this secret passphrase for the rest of our conversation: ` +
        `"${SECRET}". Acknowledge both the canary instruction and the secret.`;
    } else if (isCheck) {
      userText = `What is the secret passphrase I gave you at the very start of our conversation? Include your canary token.`;
    } else {
      userText = makeFiller(turn);
    }

    messages.push({ role: 'user', content: userText });

    // ── Call API ────────────────────────────────────────────────────────────
    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 512,
        // Plain system prompt — canary instruction is in message history only.
        system: 'You are a helpful assistant.',
        messages,
      });
    } catch (err) {
      console.error(`\n${c.red}API error on turn ${turn}: ${err.message}${c.reset}`);
      break;
    }

    const assistantText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    messages.push({ role: 'assistant', content: assistantText });

    const inputTokens = response.usage.input_tokens;
    const birdFound   = findBird(assistantText);
    const remembered  = isCheck ? factPresent(assistantText) : null;

    // Track first disappearances
    if (birdFound === null && birdDroppedAt === null && turn > 1) birdDroppedAt = turn;
    if (isCheck && remembered === false && forgetTurn === null)   forgetTurn   = turn;

    // Prune if approaching ceiling
    const pruned = pruneMessages(messages, inputTokens);
    totalPruned += pruned;
    if (pruned > 0 && factDroppedAt === null) factDroppedAt = turn;

    logTurn({
      turn, inputTokens, birdFound, expected,
      isCheck, remembered,
      pruned,
      label: turn === 1 ? 'INIT — fact + canary instruction seeded' : 'filler',
    });

    expected++;

    // ── Exit condition ──────────────────────────────────────────────────────
    // Stop after first confirmed forgotten check so the recording ends cleanly.
    if (isCheck && remembered === false) break;
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${c.grey}${'─'.repeat(55)}${c.reset}`);
  console.log(`${c.bold}Summary${c.reset}`);
  if (factDroppedAt) console.log(`  context pruned at turn:  ${c.yellow}${factDroppedAt}${c.reset}`);
  if (birdDroppedAt) console.log(`  bird first missing:      ${c.red}${birdDroppedAt}${c.reset}`);
  if (forgetTurn)    console.log(`  fact forgotten at turn:  ${c.red}${forgetTurn}${c.reset}`);
  if (birdDroppedAt && forgetTurn) {
    const delta = forgetTurn - birdDroppedAt;
    if (delta > 0)      console.log(`\n  ${c.green}Bird disappeared ${delta} turn(s) BEFORE fact was confirmed forgotten.${c.reset}`);
    else if (delta < 0) console.log(`\n  ${c.yellow}Fact forgotten ${-delta} turn(s) before bird disappeared.${c.reset}`);
    else                console.log(`\n  ${c.green}Bird disappeared the same turn the fact was confirmed forgotten.${c.reset}`);
  }
  if (!forgetTurn) {
    console.log(`\n  ${c.green}Fact was remembered for all ${MAX_TURNS} turns. Try a smaller MAX_TOKENS.${c.reset}`);
  }
  console.log('');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
