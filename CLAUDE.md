# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

Read `.ai/instructions.md` for full project instructions (architecture, conventions, testing, commits).

## Branching

Always start work from `dev` — never from `main`.

- Before creating a branch, make sure `dev` is current (`git fetch origin dev`) and branch from `origin/dev`.
- Open pull requests against `dev`.
- Never commit to, branch from, or target `main` directly. If a task appears to require it, stop and ask.

## Skills

Reference these files as needed for scaffolding:

- `.ai/skills/command.md` — Command + Action + Prompts conventions and scaffolding
- `.ai/skills/action.md` — Action class conventions and scaffolding
- `.ai/skills/context.md` — Context object conventions and scaffolding
- `.ai/skills/prompt.md` — Prompts class conventions and scaffolding
- `.ai/skills/service.md` — Infrastructure Service conventions and scaffolding
- `.ai/skills/value-object.md` — Value object (rich class) conventions: encapsulation, boundary unwrapping, composition
- `.ai/skills/event.md` — Domain event conventions: past-tense naming, variants, where to fire
