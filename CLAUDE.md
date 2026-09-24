# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

Read `.ai/instructions.md` for full project instructions (architecture, conventions, branching, testing, commits).

## Principles

Apply these when writing and reviewing code:

- **Reuse infra** — network, file I/O, OS calls, sleep, time: use existing services, Node.js standard libraries and built-in JS APIs.
- **Comments are a design smell** — improve the design until they are unnecessary; if one is unavoidable, keep it to one line.
- **Readability is king** — simple names, simple domain models, composed with simple functions that turn one type into another instead of passing primitives around.
- **Validate once, up front** — no repeated runtime type checks; later code works with guaranteed types.

## Skills

Reference these files as needed for scaffolding:

- `.ai/skills/command.md` — Command + Action + Prompts conventions and scaffolding
- `.ai/skills/action.md` — Action class conventions and scaffolding
- `.ai/skills/context.md` — Context object conventions and scaffolding
- `.ai/skills/prompt.md` — Prompts class conventions and scaffolding
- `.ai/skills/service.md` — Infrastructure Service conventions and scaffolding
- `.ai/skills/value-object.md` — Value object (rich class) conventions: encapsulation, boundary unwrapping, composition
- `.ai/skills/event.md` — Domain event conventions: past-tense naming, variants, where to fire
