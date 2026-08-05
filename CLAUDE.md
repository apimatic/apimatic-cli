# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

Read `.ai/instructions.md` for full project instructions (architecture, conventions, testing, commits).

## Branching

Always start work from `dev` — never from `main`. This applies to branches and worktrees alike.

- Before creating a branch, make sure `dev` is current (`git fetch origin dev`) and branch from `origin/dev`.
- Open pull requests against `dev`.
- Never commit to, branch from, or target `main` directly. If a task appears to require it, stop and ask.

### Worktrees

Base every worktree on `origin/dev` too.

Be aware that a new worktree starts from this repo's default branch, `beta`. Always move it onto `dev` before making any changes:

```sh
git fetch origin dev
git reset --hard origin/dev   # only in a fresh, clean worktree
```

Then confirm with `git log --oneline -1` that HEAD matches the `origin/dev` tip. Branch names and PRs from a worktree follow the same rules as above: cut from `origin/dev`, target `dev`.

## Skills

Reference these files as needed for scaffolding:

- `.ai/skills/command.md` — Command + Action + Prompts conventions and scaffolding
- `.ai/skills/action.md` — Action class conventions and scaffolding
- `.ai/skills/context.md` — Context object conventions and scaffolding
- `.ai/skills/prompt.md` — Prompts class conventions and scaffolding
- `.ai/skills/service.md` — Infrastructure Service conventions and scaffolding
- `.ai/skills/value-object.md` — Value object (rich class) conventions: encapsulation, boundary unwrapping, composition
- `.ai/skills/event.md` — Domain event conventions: past-tense naming, variants, where to fire
