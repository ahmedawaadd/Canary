# Canary 🐦

## when the bird stops singing, stop trusting the output

Canary is a context health monitor for Claude Code. It makes Claude end **every
single reply** with a small bird and a counter:

```
[🐦:1]
[🐦:2]
[🐦:3]
```

That's the whole idea. The bird is a canary in the coal mine for your context
window.

## What's "context degradation"?

The longer a chat runs, the more stuff Claude has to hold in its head — your
files, your earlier messages, its own answers. At some point the window fills
up and older details get squeezed out or summarized. When that happens Claude
quietly starts forgetting things, repeating itself, or drifting off the task.

The problem is you usually can't *see* it happening. The answers still look
confident.

Canary gives you something to watch. Claude is told to put the bird at the end
of every reply and count up by one each time. As long as the bird shows up and
the number keeps climbing in order, the instruction is still holding and
context is healthy.

When the bird **vanishes**, **repeats a number**, or **resets** — that's your
early warning. The instruction fell out of context, which means other things
are falling out too. Time to start a fresh session.

## Before / after

**Without Canary:**

```
Sure — I've updated the function to handle the null case.
```

**With Canary:**

```
Sure — I've updated the function to handle the null case.

[🐦:7]
```

Same answer. One extra line. But now you know the bird is still alive at reply
seven — and you'll notice the moment it isn't.

## Install

### Via Claude Code marketplace

```
/plugin marketplace add ahmedawaadd/Canary
/plugin install canary
```

### Via curl (one-liner)

```
curl -fsSL https://raw.githubusercontent.com/ahmedawaadd/Canary/main/install.sh | bash
```

That's it. Start a chat and watch the bird.

## License

MIT
