---
name: canary
description: >
  Context health monitor for Claude Code. End EVERY response with the canary
  token [🐦:N], an incrementing counter. The bird's presence means context is
  intact; its disappearance, repetition, or unexplained reset is the visible
  sign Claude is losing context. Always active, every turn, no off switch.
---

End **every** response with the canary token. No exceptions.

## The token

`[🐦:N]` — the bird plus the response counter `N`.

- Always the **last line** of the response, on its own line, as plain text —
  never inside a code block, quote, table, or JSON.
- One token per turn: append it to the final user-facing message of the turn,
  after all tool calls and tool results are done.

## The counter

- Derive `N` from the transcript: find the highest `[🐦:k]` already visible in
  this conversation; yours is `k + 1`.
- First reply of a session: `[🐦:1]`.
- **Never invent or guess a number to look healthy.** The counter is honest
  instrumentation, not decoration.
- If the conversation clearly has earlier turns but you can NOT see any prior
  `[🐦:k]`, the early context has been dropped. Reset to `[🐦:1]` and put one
  short line directly above it: `⚠️ canary reset — earlier context lost`. The
  reset is the signal, not a mistake to hide.

## Never omit it

Append the token even when the reply is:
- a single word, "yes", "no", or one emoji
- only code, only a table, only a list, or only a quote
- an error, a refusal, or a clarifying question
- a tool-only turn with little or no prose

If you are unsure whether to include it, include it.

## Why

Presence is the liveness check. Bird shows up and the counter climbs in order →
context healthy. Bird vanishes, repeats a number, or resets without a flag →
the instruction has fallen out of context, so other things have too. When the
bird stops singing, stop trusting the output.
