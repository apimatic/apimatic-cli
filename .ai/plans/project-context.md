# Plan: `ProjectContext` as the one place that knows a project's layout

Status: written and executed 2026-09-25 on `feat/journey-command-updates`, after
`dev` was merged into it (`cc6b974`). Steps 1, 2 and 5 landed as written; step 4
landed smaller than planned and step 3 was **withdrawn on contact with the code**
— see section 6, which records what each step actually did and why.

Vocabulary is CONTEXT.md's: **source directory** is the user's `src/`, **project
directory** is the directory that contains it.

## 1. Goal

`ProjectContext` is named for a project and knows one thing about it: the
`.gitignore`. Everything else about the layout — where `src/` is, where `sdk/`,
`portal/` and `plugin/` go, which contexts read which of them — is re-derived by
whichever command or action needs it. This plan makes `ProjectContext` the one
object that knows the layout and hands out the contexts that read it, following
the composite pattern the context skill already names as good
(`BuildContext.getSpecContext()` hands back a `SpecContext`, not a path).

Out of scope: the temp and output contexts that are not tied to the layout —
`TempContext`, `ResourceContext`, `TransformContext`, `PackageSettingsContext`.
They take a directory a caller already has and should keep doing so.

## 2. What is actually duplicated

Four separate duplications, all of the same fact.

**2.1 `src` is spelled four ways in ten places.**

| Spelling | Sites |
|---|---|
| `workingDirectory.join('src')` | `commands/plugin/generate.ts:34`, `commands/plugin/publish.ts:34`, `commands/portal/generate.ts:40`, `actions/sdk/publish/interactive.ts:35` |
| `new DirectoryPath(input, 'src')` | `commands/sdk/generate.ts:76`, `commands/sdk/publish.ts:105` |
| `DirectoryPath.createInput(input).join('src')` | `commands/portal/serve.ts:47` |
| `projectDirectory.join('src')` / `workingDirectory.join('src')` inside an action | `actions/quickstart.ts:94,143,147,173`, `actions/sdk/publish/interactive.ts:158,162` |

The first three differ in how an absent `--input` is resolved. Nothing makes them
agree, and nothing would notice if one drifted.

**2.2 The output directory names live twice, and cannot disagree loudly.**

`ProjectContext.GENERATED` is `['/sdk/', '/portal/', '/plugin/']` — the entries
written into `.gitignore`. The directories those entries are *about* are derived
independently, as string literals, in six command files:

```
commands/sdk/generate.ts:77      destination ?? workingDirectory.join('sdk')
commands/sdk/publish.ts:106      destination ?? workingDirectory.join('sdk')
commands/portal/generate.ts:41   destination ?? workingDirectory.join('portal')
commands/plugin/generate.ts:35   destination ?? workingDirectory.join('plugin')
commands/plugin/publish.ts:35    destination ?? workingDirectory.join('plugin')
```

Renaming an output directory means editing six commands and a string array in a
seventh, and a miss shows up as a dirtied checkout, not a failure.

**2.3 Three contexts wrap the same file over the same directory.**

`PortalSourceContext` (`portal-source-context.ts:84`), `PluginConfigContext`
(`plugin-config-context.ts:129`) and `RecordPublishedSdkAction`
(`actions/sdk/record-published-sdk.ts:67`) each construct their own
`ApimaticConfigContext` over the source directory, each with its own
`FileService`. They read and merge different blocks of one `apimatic.json`, which
is correct — but the caller has to know to build each one, and each holds an
independent view of a file the others are also writing.

There are **28** `new …Context(` sites in `src/`, and every layout-bound one takes
a path the caller derived.

**2.4 Prompts re-derive private paths in order to name them.**

`PortalSourceContext` keeps `specDirectory`, `contentDirectory` and
`staticDirectory` as `private get`, as the skill requires. Eight prompt sites then
compute the same paths themselves purely to print them:

```
prompts/portal/serve.ts:51,65,66,67,92
prompts/portal/source.ts:53,92,99
```

This is the rule being satisfied in the letter and broken in fact. The plan has to
answer it rather than route around it — see §5.

## 3. The shape

```ts
/** The directory that contains a source directory: what every command is pointed at. */
export class ProjectContext {
  private constructor(private readonly projectDirectory: DirectoryPath) {}

  /** What a command has: an `--input` flag that may be absent. */
  public static at(input: string | undefined): ProjectContext;

  // The contexts, not the paths they are built from.
  public source(): PortalSourceContext;
  public config(): ApimaticConfigContext;
  public pluginConfig(): PluginConfigContext;
  public build(): BuildContext;

  // Outputs. `destination` is the `--destination` flag, which overrides the default.
  public sdk(destination?: string): SdkContext;
  public plugin(destination?: string): PluginContext;
  public portal(destination?: string): PortalContext;

  public upsertGitignore(): Promise<Result<void, GitignoreFailure>>;
}
```

`GENERATED` becomes derived from the same names `sdk()`, `plugin()` and `portal()`
use, so §2.2 cannot drift.

The constructor goes private and `at()` becomes the only way in, which settles
§2.1: one resolution of an absent `--input`, in one place.

## 4. What happens to each existing context

| Context | Change |
|---|---|
| `PortalSourceContext` | Unchanged. Constructed by `ProjectContext.source()` instead of by callers. |
| `ApimaticConfigContext` | Unchanged. Still constructed internally by the two contexts that wrap it; `ProjectContext.config()` serves the third caller. |
| `PluginConfigContext` | Unchanged. Constructed by `ProjectContext.pluginConfig()`. |
| `BuildContext` | Unchanged, except `getSpecContext()` — see below. |
| `SpecContext`, `PluginContext`, `PortalContext`, `SdkContext` | Unchanged; reached through `ProjectContext`. |
| `ProjectContext` | Gains the layout. Keeps `upsertGitignore()`. |
| `TempContext`, `ResourceContext`, `TransformContext`, `PackageSettingsContext` | Untouched. |

**No context is deleted.** The redundancy is not that the classes exist — each has
a real domain — it is that *callers* assemble them from paths they derive
themselves. This plan moves the assembly, not the responsibilities.

`BuildContext.getSpecContext()` is the one overlap: it derives `spec/` off the
source directory, which `PortalSourceContext` also does privately. Leave it. The
two read the same directory for different purposes and merging them is a separate
question from this one.

## 5. The tension with the context skill, and how it resolves

The skill says: *DON'T expose internal paths as public getters*, and *DON'T pass
internal paths through callback parameters*. A `ProjectContext` that answered
`sourceDirectory()` would be exactly the getter the skill forbids.

But three things genuinely need the path itself, not a context over it:

1. `PortalServeAction.execute(sourceDirectory, …)` and the other actions take a
   directory, because they are given one by a command.
2. The eight prompt sites in §2.4 need it to *name* it to the user.
3. `PortalProjectService` copies from it (`portal-project-service.ts:230,262,265,309`).

Two options, and this plan picks the second:

- **(a) Pure.** No path leaves `ProjectContext`; actions take a `ProjectContext`
  and prompts are given already-formatted strings. This is the skill obeyed
  exactly, and it is a large change: every action signature, and a prompt layer
  that receives strings instead of paths, which loses `f.path()`'s formatting at
  the call site.
- **(b) One named accessor, and the layout stays single-sourced.** Add
  `sourceDirectory(): DirectoryPath` and the three output-directory accessors,
  documented as the boundary they are. Callers stop *deriving* the layout even
  though they can still *ask* for it, which removes every duplication in §2
  while leaving action signatures alone.

**(b), and the skill gets an amendment rather than an exception.** The rule exists
so a context's internals cannot be reassembled by a caller; here the path *is* the
domain value, and the alternative is eight prompts computing it from a literal. The
skill's `DON'T` should be narrowed to "no getter that exposes a path the caller
could otherwise not have" and this case named in it. Doing that honestly is part of
the work, not a footnote — without it the next reviewer is right to object.

## 6. Steps

One commit each, each leaving the tree green. What each actually did follows the
description, because two of them did not survive contact with the code.

1. **`ProjectContext.at()` and the source directory.** Add the factory and
   `sourceDirectory()`. Convert the ten sites in §2.1.
   *Done as written, in `569fe30`, together with step 2.* `ProjectContext.in()`
   was added alongside `at()` for the one caller — interactive `sdk publish` —
   that is handed a directory it asked the user for rather than a flag naming it.
2. **The output directories.** Add the three output accessors taking the
   `--destination` override. Convert the five command sites. Derive `GENERATED`
   from the same names so §2.2 is structural.
   *Done as written, in `569fe30`.*
3. **The context accessors.** Add `source()`, `config()`, `pluginConfig()`,
   `build()`.
   ***Withdrawn.*** The actions that construct these contexts are handed a
   **source** directory by their command, not a project directory, so the
   accessors would have had no caller without changing eight action signatures to
   take a `ProjectContext` — option (a) of §5, which §5 rejected as too large.
   And `BuildContext` settles it outright: `actions/sdk/generate.ts:67,81`
   construct it over *versioned* subdirectories discovered inside the build
   (`getSingleVersionedSourceDirectory`), which no project layout can derive. A
   `ProjectContext.build()` could not have replaced them.
   What §2.3 describes is therefore not redundancy to remove: three contexts over
   one `apimatic.json`, each owning different blocks, is the design. Only the
   *assembly* looked duplicated, and the assembly is in the commands, which do
   not construct these contexts at all.
4. **The prompts.** Delete the eight re-derivations.
   *Done smaller, in `3670734`.* Passing the paths in would have required public
   path accessors on `PortalSourceContext` — the getter §5 argued against, in the
   one place the argument does not hold, since the prompts are given a directory
   and not a context. Instead the three **names** are exported and both sides use
   them, so a prompt cannot spell `content` differently from the context. The
   getters stay private and the eight literals are gone, which was the actual risk.
5. **The skill.** Amend `.ai/skills/context.md` per §5 and add `ProjectContext` to
   its reference table.
   *Done as written.*

Steps 1 and 2 were where the silent-drift risk lived, and they are the ones that
landed whole.

## 7. What this does not fix, deliberately

**`--destination` escapes `.gitignore`.** `plugin generate --destination ./out`
writes a plugin to `./out`, which `.gitignore` does not name, so `plugin publish`'s
`git init` sits in a tracked directory. `ProjectContext` owning both halves makes
this visible for the first time — it does not fix it, and fixing it is a decision
about what `--destination` means, not about layout.

**`PluginConfigContext` and `PortalSourceContext` both being views of
`apimatic.json`.** They are, and a later plan may merge them. This one deliberately
does not, because merging them changes what each command may read and write, which
is a behaviour change wearing a refactor's clothes.

## 8. Risk — reassessed before starting, and lower than drafted

The draft said step 1 was a behaviour change, because
`new DirectoryPath(input, 'src')` and `DirectoryPath.createInput(input).join('src')`
looked like they would resolve differently. They do not: `join` is
`new DirectoryPath(path.join(resolved, sub))` and the constructor is
`path.resolve(...)`, so both land on the same path for every input, absent
included. The ternary in `commands/sdk/generate.ts:76` and
`commands/sdk/publish.ts:105` was dead weight, not a difference.

So step 1 changed no behaviour, and the risk in this plan is only that a caller
is given a directory the accessors do not describe — which is what withdrew
step 3.
