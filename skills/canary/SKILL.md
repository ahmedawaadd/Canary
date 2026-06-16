---
name: canary
description: >
  Context health monitor for Claude Code. End EVERY response with the canary
  token [🐦:N] provided at the start of each turn. Presence means context is
  intact; absence or mismatch is caught by the Stop hook. Always active, every
  turn, no off switch.
---

End **every** response with the canary token. No exceptions.

## The token

Each turn, the system will tell you exactly which token to emit — for example:
`Canary: end this response with exactly: [🐦:7]`

Copy it verbatim. Do not calculate, derive, or guess the number — the hook
owns the counter. Your only job is to echo what you're given.

The token is always:
- The **last line** of the response, as plain text
- On its own line, after all content including closing code fences
- Never inside a code block, quote, table, or JSON

## Never omit it

Append the token even when the reply is:
- a single word, "yes", "no", or one emoji
- only code, only a table, only a list, or only a quote
- an error, a refusal, or a clarifying question
- a tool-only turn with little or no prose

If you are unsure whether to include it, include it.

## Why

The token is a liveness echo. The hook tells you what to write; if you write
it correctly, the hook stays silent. If the token is missing or wrong, the hook
warns the user — catching context loss even when you are not aware it happened.
