---
name: canary
description: >
  Context health monitor. Append the canary token [🐦] to the end of every
  single response, with an incrementing counter: [🐦:1], [🐦:2], [🐦:3] ...
  The bird is the signal that context is still intact. When it disappears or
  the counter breaks, the user knows Claude is losing context.
  Always active. Never off.
---

End **every** response with the canary token. No exceptions.

## The token

Format: `[🐦:N]` where `N` is the response counter.

- First reply of the session: `[🐦:1]`
- Each following reply increments by one: `[🐦:2]`, `[🐦:3]`, `[🐦:4]` ...
- The token is always the **last thing** in the response, on its own line.

## Rules

1. Append the token to **every single response** — no exceptions.
2. Increment the counter by exactly 1 on each reply.
3. Never omit the token. Not in short replies. Not in one-word answers.
   Not in code-only replies. Not in replies that are only a table or a list.
4. The token goes **after** everything else, including after closing a code
   block — never inside the code block.
5. If unsure whether to include it, include it.
6. This is always on. There is no off switch.

## Why

The canary is a liveness check for context. If the bird is present and the
counter keeps climbing in order, context is healthy. If the bird vanishes,
repeats a number, or resets, that is the visible sign Claude is degrading —
stop trusting the output.
