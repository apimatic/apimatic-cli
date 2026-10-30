# Custom code, built in vertical slices

Status: planned on `asadali214/custom-code-redesign`, cut from `dev` at `dc3235a1` on
2026-10-30. Nothing from the first attempt is reused as code; it is reference only.

What the feature does is written down, step by step, in the doc "Custom-code split plan"
(https://claude.ai/artifact/4ocLd2wGVmgRWfmh2Scme7). This file says in what order it is built,
one behaviour at a time, so each phase can be run and reviewed on its own.

## 1. How a phase works

- Each phase delivers one behaviour a developer can run, with the tests that prove it. A phase
  creates only the code that behaviour needs: a class appears the first time a slice has
  something to hold, a method the first time a slice calls it, a prompt the first time it is said.
- A phase starts from the working tree as the reviewer left it. Nothing is committed by the
  agent; the reviewer reads, tailors or refactors the code, and the next phase builds on that.
- A phase ends with `tsc` on `src` and `test`, ESLint, Prettier on the touched files, the
  phase's tests, and one full run of the suite.
- Where a placement is unclear, the agent asks before writing, with options and their
  trade-offs. Section 4 lists the questions each phase is expected to raise, so the reviewer
  can answer them ahead of time.

References, on the branch `asadali214/custom-code-rewrite`:

| Commit | Holds | Used for |
|---|---|---|
| `533bcf1a` | the flags, the git service, value objects, prompts wording, publish changes, docs | the behaviour and the wording to reproduce; the git plumbing that is known to work |
| `92988f2f` | the whole run as one file, with every behaviour test | the tests each phase ports: `test/actions/sdk/generate-destination.test.ts`, `generate-write.test.ts`, `test/types/sdk-repository-context-merge.test.ts`, `sdk-repository-context.test.ts`, `sdk-context.test.ts`, `test/infrastructure/git-service.test.ts`, `test/prompts/sdk/generate.test.ts`, `test/types/sdk/*.test.ts` |

A ported test keeps its name and its assertions; only the seam it drives changes to the new
design.

## 2. Rules for the code

These come from the review of the first attempt and apply to every phase.

- **Functional core, imperative shell.** A step reads every fact it needs first, decides as a
  pure function over that data, then does its I/O. `execute` is the script of the run and the
  only place that speaks; the prompts word the data they are handed and decide nothing.
- **No private instance methods.** A class has `private readonly` fields and public methods.
  A helper is a `private static` method or a module-level function.
- **No middlemen.** A method does something with each argument: reads it, transforms it, or
  combines it with the object's own state. No method only forwards to another call, and no
  layer re-exposes a service one to one.
- **Good code is not more functions.** A step's logic stays together where it reads as one
  thing. A function is split out only when it is used twice, when it separates a decision from
  I/O, or when its name says something the reader would otherwise have to work out. A one-line
  call does not get a wrapper.
- **The repository's conventions** stay: `Promise<Result>` with `await` and early returns,
  typed paths, `ActionResult` as a plain outcome, one prompts class per action, comments only
  for a why.

## 3. The phases

| Phase | A developer can | Ends as |
|---|---|---|
| 0 | generate into the SDK directory itself, with the old flags gone | Success, Failed, Cancelled |
| 1 | make the SDK directory a repository with `--git-init`, and have the first generation recorded | + git looked for only when wanted |
| 2 | regenerate and have their edits merged, when nothing conflicts | + conflicts listed, not yet asked about |
| 3 | choose how a conflict is settled, or resolve it by hand | + Action required |
| 4 | rerun after leaving conflicts, and be asked what to do with them | + refusals of a repository mid-operation |
| 5 | regenerate in a clone, which fetches the snapshot it lacks | |
| 6 | push, and have the snapshots shared by a hook | |
| 7 | publish an SDK that keeps edits, uploading only what git would commit | |
| 8 | read the docs for all of it | |

### Phase 0: the SDK directory is the destination itself

The breaking change on its own, before any git: what a run is given, and where it writes.

Behaviour:

1. `sdk generate` takes `--codegen-version`, `--stability`, `--destination`, `--force`,
   `--input`, `--auth-key`. `--api-version` and `--zip` are gone, and with them the versioned
   build lookup.
2. The SDK directory is the `--destination` itself, else `<input>/sdk/<language>`. One
   place derives it, for both SDK commands.
3. The run refuses a destination that contains `src`, since the write empties it.
4. Without a terminal, the overwrite question is not asked: the run fails, naming `--force`.
5. `sdk publish` follows: it passes the generation it was given and the directory the project
   derived. A dry run generates into the SDK directory, not a numbered folder under Downloads.

Touches: the generate command and action; the publish command and the two publish actions;
`SdkContext` reduced to the directory; `ProjectContext.sdkDirectory(language, destination)`;
`terminal.isInteractive()`; the flag description for `--force` on the SDK commands; the README
regenerated. Removed: `BuildConfig`, `versionToBuild`, the Downloads helper, the `zip` save.

Tests: dev's `test/actions/sdk/generate.test.ts` reshaped, plus from `92988f2f`: "writes into
the destination itself", "refuses … as the destination", "stops before generating when the
developer declines to overwrite"; `project-context.test.ts` "sdk" cases; `publish.test.ts`
"runs a dry run on the SDK directory the project names"; `publish-flags.test.ts`.

### Phase 1: the first run records

With `--git-init`, the SDK directory becomes a repository of its own and the generation is
recorded in it, so the next run has a base.

Behaviour:

1. Git is looked for only when the SDK directory has a `.git` of its own, a folder or a
   worktree's file, or `--git-init` was given. Otherwise the SDK is saved as in phase 0, and the
   run ends with the Next steps box: rerun with `--git-init` before changing anything.
2. Git absent, or older than 2.38: warn that customizations will not persist, then save as
   before, keeping any `.git`. Git present but not answering: Failed.
3. A repository counts only when its root is the SDK directory itself. One that only encloses
   it is treated as none, and nothing is written into it.
4. `--git-init` on a directory with no repository of its own: `git init` on `main` after the
   generation succeeded, say so, save, record. A failed init writes nothing.
5. A repository of its own with no record: say it was found, save, record.
6. Recording: the generation as a tree of every file, committed under `refs/apimatic/pristine`
   with the CLI as author; then `.apimatic/.gitattributes` and `.apimatic/generation.json`
   naming the commit, each written only when changed. A failure here is a warning, since the
   SDK is on disk.
7. The overwrite question counts every entry but `.git`, hidden ones included, since the save
   keeps only `.git`.

Touches: `GitService` with its runner (the `-c` settings, the attributes file for normalised
line endings, `GIT_DIR` cleared) and the methods `version`, `topLevel`, `init`, `tree` of every
file, `commitTree`, `resolveRef`, `treeOfCommit`, `updateRef`; `GitVersion`, `CommitId`,
`TreeId`, `SnapshotRef`, `GenerationRecord`, `GIT_DIRECTORY`; `FileService.hasEntriesExcluding`;
the `--git-init` flag; the prompts for the warning, the two repository messages, the Next steps,
the failed init, a failed recording and a directory git could not inspect; the ESLint rule that
keeps `src/types/sdk/` free of file and process access.

Tests from `92988f2f`: generate-destination "with no git / an older git …" (both), "does not
look for git without a repository …", the "not a repository of its own" group, "records into
the SDK directory's own repository …", "asks before replacing a repository … hidden files",
the "overwrite question" group, "reports a directory git could not inspect"; generate-write
"overwrite" and "record" groups; sdk-context "destination, by the SDK directory's own
repository", "destination, and when git is looked for", "exists", "initRepository", "save";
sdk-repository-context "recordPristine" group and "the generation record" (first three);
git-service "treeOf" (every file, CRLF stored as LF), `version`, `topLevel`, `init`,
`commitTree`, `resolveRef`; the prompts tests for the messages added; `generation-record`,
`snapshot-ref`, `git-version`, `commit-id` value-object tests.

### Phase 2: a regeneration merges

The run finds the record, merges the fresh generation over the directory with git, and writes
only what changed. Conflicts are found and listed, but not yet asked about: a run that meets
one fails with the list, as a run without a terminal will always do.

Behaviour:

1. Inspect the repository: the record, whether it is for this generation, whether the commit
   it names is here. No record, or another generation: record afresh after the overwrite
   question, with no further warning. The commit missing and no remote: say the snapshot is
   not available, then record afresh. Under `--force`, a recorded SDK the run cannot merge into
   is replaced, with a warning after the write that the customizations were not carried over.
2. Snapshot the generation (every file) and the directory as it is (its ignore rules honoured,
   except that every path the base holds goes in), both with line endings normalised.
3. Merge the two over the base with `merge-tree`, renames paired both ways. From git's merge
   and diffs, know every file to write and remove, each conflict and its kind, and what
   happened to every other file: added, updated, merged, removed, kept.
4. Keep the directory as it is, byte for byte, under `refs/apimatic/previous`.
5. Remove before writing. Write markers relabelled "Your changes" and "Generated by APIMatic",
   each file with its own line ending (else the generator's), and skip a file whose bytes would
   not change. Remove the folders a removal leaves empty, below the SDK directory.
6. A write that fails puts back what it touched from the previous snapshot and names the
   file; if that fails too, the restore command is given. Failed.
7. Record the new generation chained on the base; an identical generation keeps the last
   commit. Then the summary: counts of added, updated, merged and removed files, and the
   merged and kept files by name.
8. With conflicts: list them with their kinds and how to rerun; nothing written. Failed.

Touches: `GitService.hasCommit`, `listTree`, `tree` of the working tree (normalised and as
is), `readBlobs`, `mergeTree`, `diff`; `BlobId`, `RelativeFilePath`, `ValueMap`, the
`merge-tree` and `diff-tree` output types and parsers; `FileService.getBytes`, `writeBytes`,
`removeEmptyDirectories`; the merge plan and the summary as pure data; binary and line-ending
rules; the `recordedSdkReplaced`, `snapshotMissing` (no remote), `sdkMerged`,
`conflictsNotAsked`, `sdkNotWritten` and `customCodeFailed` prompts.

Tests from `92988f2f`: generate-destination "records over an SDK generated at another
stability …", "records over an SDK whose snapshot the repository does not hold …",
"replaces, with --force, …" (both), "merges against the recorded snapshot …";
generate-write "merge" group except the two marker cases, and "refuses without a terminal,
naming the conflicts"; the merge table except the marker and settlement cases ("merges your
edit …", "adds a file …", "accepts one with the same", the renames without markers, "how the
plan lands on disk", "a write that fails partway", the content rules except "labels the
markers …" and the binary conflict, "two spec versions" for the files they keep);
sdk-repository-context "inspect" cases for no record, another generation and a missing
snapshot; git-service `mergeTree`, `diff`, `listTree`, `readBlobs`, "keeps every byte …";
`merge-plan.test.ts` for writes, deletes and the summary; `file-content` rules.

### Phase 3: conflicts are asked about

Behaviour:

1. In a terminal, before anything is written: list the conflicts and ask. "I'll resolve them
   myself", "Resolve using generator changes", "Resolve using my changes", "Cancel this run".
   Backing out cancels, with nothing written and no previous ref saved.
2. `--force` answers for the generator without asking.
3. A chosen side settles each marked file block by block as it is written, keeping every line
   outside the markers; a file one side deleted, or a binary one, is settled whole: the
   generator's version where it has one, else yours stays. Say which files were resolved and for
   which side.
4. Resolving by hand: the markers stay, the conflicted paths go into git's index at stages 1,
   2 and 3 as a merge would leave them, and the steps follow the summary: resolve in a merge
   tool or by hand, files with markers and without listed apart, then rerun. If the index could
   not be marked, warn and leave the merge tool out.
5. The run ends as Action required: a yellow outro, exit 1, so a chained command does not run.

Touches: `ActionResult.actionRequired()` and `isActionRequired()`, the yellow outro and the
fourth `mapAll` callback; `GitService.stageConflicts`; conflict kinds completed (both changed,
both added, deleted by you, no longer generated, binary, other), settling markers for a side,
the plan with a side taken; the `conflictChoice`, `conflictsResolved`, `conflictSteps`,
`conflictsNotStaged` and `runCancelled` prompts.

Tests from `92988f2f`: generate-write "the question when the merge conflicts" group, "writes
markers …", "leaves the merge tool out …"; the merge table's marker cases, "settled for a side"
group, the binary conflict and the two-spec conflicts; `conflict-markers.test.ts`,
`settlement.test.ts`, `merge-plan.test.ts` for `taking`; `action-result.test.ts`,
`format.test.ts`; the prompts tests about the conflicts.

### Phase 4: the next run after conflicts were left

Behaviour:

1. Before the record is read, git's unmerged entries below the SDK directory are listed. Any
   means the last run's conflicts are unresolved, whatever the record says.
2. Without a terminal and without `--force`: list them, Action required. With `--force`: settle
   them for the generator. In a terminal: ask. "I'll finish resolving them" ends as Action
   required; backing out cancels; either side settles.
3. Settling reads what is on disk and the two sides git kept in the index: markers still there
   settle in place; a file one side lacks, or a binary one, takes the chosen side whole, the
   generator's side keeping yours where it has none; text whose markers are gone was resolved
   by hand and stays. The files then leave the unmerged state.
4. Inspect again, once; anything still unmerged is listed and the run ends as Action required.
   Otherwise the run goes on to generate and merge.
5. A repository in the middle of a merge, rebase, cherry-pick or revert of the developer's own
   is refused first, naming the operation and how to abort it.

Touches: `GitService.unmergedStages`, `unstage`, `operationInProgress`; `GitOperation`; the
settling of an unresolved file as a pure rule; the `unresolvedChoice`, `conflictsUnresolved`,
`resolveLater`, `conflictsNotSettled` prompts and the operation-in-progress wording.

Tests from `92988f2f`: generate-destination "ends as Action required without a terminal …",
"refuses an unmerged file before looking at the record …", the "question while the last run's
conflicts are unresolved" group, "refuses while the repository is in the middle of a merge …";
sdk-repository-context "settling what the last run left unresolved", the "inspect" cases about
unmerged files and the operation in progress; git-service `unmergedStages`;
`unresolved-file.test.ts`; `repository-facts.test.ts` for the order of the facts.

### Phase 5: a clone merges against a snapshot it fetches

Behaviour:

1. When the record names a commit the repository lacks and there is a remote (the branch's,
   else `origin`), fetch `refs/apimatic/pristine` from it, with no prompts, a batch-mode ssh
   and a 30-second limit.
2. The fetched chain is adopted when there is none here or it continues the local one, kept
   when it is behind, and joined with a two-parent commit when the two diverged.
3. The commit here now: merge. Still absent: say the remote lacks it, or why the fetch failed,
   then the overwrite question and a fresh record.
4. `--destination` naming a clone of an SDK repository regenerates over the clone.

Touches: `GitService.remoteOf`, `fetchRef`, `isAncestor`, the remote options of the runner;
`RemoteName`; the chain reconciliation as a pure rule; `snapshotMissing` for the absent and
failed cases.

Tests from `92988f2f`: generate-destination "merges in a clone only once the pristine refs
were fetched by hand …", "merges over a clone of an SDK repository named as the destination
…"; sdk-repository-context "sharing" group; git-service "remotes" group except the hooks
cases, "leaves an SSH client the developer configured …", "tells an ancestor from a stranger";
`pristine-chain.test.ts`.

### Phase 6: every push shares the snapshots

Behaviour:

1. After every recording, the script `apimatic-pre-push` is written into git's own hooks
   directory, executable, and the `pre-push` hook git runs is made to call it: a new shell hook
   when there is none, the call right after the shebang of an existing shell hook, and nothing
   when the call is there already.
2. With `core.hooksPath` set, the CLI writes nothing there. It names the file git runs (beside
   husky's `_`) and the one line to add, with a commit step when that file is in the
   repository. A hook in another language is left alone and named the same way.
3. The script pushes the pristine ref with `--no-verify`; when rejected, it fetches the
   remote's chain to a tracking ref, joins, and pushes again; a second failure prints one line
   in the server's words and never fails the push.
4. The run says once that it wrote the hook, or what one step is still needed, or that the hook
   could not be written. Later runs are silent.

Touches: `GitService.hooksDirectory`, `hooksPathConfigured`, `hooksRunFrom`;
`FileService.makeExecutable`; the script and the marked block as constants; the hook decision
as a pure rule; the `shareHookInstalled`, `shareHookNeedsOneStep` and `shareHookNotInstalled`
prompts, and the recording notice that chooses one message.

Tests from `92988f2f`: generate-write "the hook that shares snapshots" group;
sdk-repository-context "the hook that shares snapshots" group (writes once, elsewhere, under
the home directory, quiet once it calls, another language, shares on push, through husky, a
clone that never ran the CLI, joins at push time, the server's words, ahead of an existing
hook); git-service hooks cases; `share-hook.test.ts`, `recording-notice.test.ts`.

### Phase 7: `sdk publish` keeps edits too

Behaviour:

1. `sdk publish` run with flags always passes `--git-init` and never asks. Run without flags, or
   with `--git-init` alone, it is the step-by-step experience, which asks for the SDK directory
   after the language and passes the flag on.
2. The upload holds what git would commit: not `.git`, not `.apimatic`, and not what the SDK's
   own ignore rules keep out. Outside a repository of its own, everything but `.git` and
   `.apimatic`.
3. A generation that ends as Action required publishes nothing, and says the SDK still has
   conflicts.

Touches: `GitService.ignoredBelow`; `RelativeDirectoryPath` and `RelativePaths`;
`ZipService.archiveWithout` and `TempContext.zipWithout`; the `--git-init` flag on publish and
the interactive-mode rule; the `conflictsNotPublished`, `dryRunNotice` and
`destinationContainsSource` wording on the publish prompts.

Tests from `92988f2f`: `publish.test.ts` ("uploads the SDK without the CLI's record …",
"publishes nothing, and ends as Action required …", "reports an SDK it could not zip …"),
`publish-flags.test.ts`; sdk-context "archive" group; git-service `ignoredBelow`;
`zip-service.test.ts` for the exclusions; `relativeDirectoryPath.test.ts`.

### Phase 8: docs and leftovers

1. `CONTEXT.md` gains the terms: SDK directory, pristine snapshot, generation record, custom
   code.
2. The design document `.ai/plans/custom-code.md` from `533bcf1a` comes back with sections 9 and
   10 rewritten for the layout the phases produced; the decisions and the lab cases stay.
3. The README is regenerated, and the convention notes land in the `.ai` instructions and
   skills.
4. Optional, to decide at review: the cleanups the first attempt carried that are not this
   feature. The plugin action and the not-found hooks reading the terminal check instead of
   `process.stdin.isTTY`; the unused methods on the config, plugin, portal, spec and file
   classes; the error map on `ServiceError`.

## 4. Questions each phase will raise

Each is asked when its phase reaches it, with these options. An answer written here ahead of
time saves the question.

**Phase 0: the run's inputs.** The action takes `force` today.

- One `RunMode` value (`force`, whether a question can be asked, later `gitInit`), built by
  the command. For: one argument, and the publish actions build it the same way. Against: a
  type for three flags.
- Separate parameters. For: nothing new. Against: every caller changes with every phase.

**Phase 1: where the inspection lives.** Reading the `.git` on disk, asking git for its
version and the root, then the record.

- On `SdkContext`, which already holds the directory. For: the directory is the only state
  these steps need. Against: the class grows a method for each phase.
- Module-level functions taking the directory, with no class. For: nothing to hold. Against:
  the project's convention is a context class around a directory.

**Phase 1: the repository as a fact.** Once git says the directory is a repository of its own,
the recording needs that root.

- A second class holding the root, created only when the root is found. For: "a repository was
  found" is carried by the type, checked once; every later phase adds to it (inspect, merge,
  settle, record, hook). Against: two classes around one directory; the first phase would give
  it two methods.
- Methods on `SdkContext` that take the root they were handed. For: one class. Against: every
  caller passes the root the class could have held, which is the middleman shape in reverse.
- Decide by the end of phase 2, when there are enough methods to see the shape. For: the
  evidence is in. Against: phase 1 is written one way and may be moved.

**Phase 2: what a merge answers with.** Git's merge becomes a plan of writes, removals,
conflicts and the summary.

- One class, the plan, holding all of it with the operations on it (take a side, which paths
  carry markers). For: the merge result is one thing the summary, the settlement and the write
  all read. Against: it is the largest pure type in the feature.
- Plain records and functions over them. For: nothing to hold. Against: six functions taking
  the same record.

**Phase 2: how a write is undone.** The step that lands the plan also puts files back when a
write fails.

- Landing and undoing in one place, since the undo needs what landing touched. For: the
  invariant lives in one function. Against: it is the longest function in the shell.
- Landing returns what it touched, and a separate step restores. For: shorter pieces. Against:
  a step that only exists for the failure path.

**Phase 3: the end state.** Conflicts left for the developer need a fourth `ActionResult`.

- A new `ActionRequired` kind with exit 1 and a yellow outro, as the product review chose. For:
  not a success, since the SDK will not build; not a failure, since the run did what was
  chosen. Against: every `mapAll` caller gains a callback.
- Reuse `failed` with a message. For: no new kind. Against: `sdk publish` could not tell a
  conflict from a failure, and the outro would be red for a run that did what was asked.

**Phase 6: where the hook text lives.** The script and the marked block are constants that the
pure decision and the installer both read.

- Beside the hook decision in `src/types/sdk/`. For: the decision tests read them. Against: a
  shell script as a TypeScript constant among pure functions.
- In infrastructure, beside the git service. For: it is git's hooks directory. Against: the
  decision would import infrastructure, which the ESLint rule forbids.

## 5. Out of scope

As the first attempt decided: an ignore list for frozen files, patch files, code regions,
portal downloads that include custom code, and any push by the CLI itself. Telemetry for
conflicts is not sent; the `ActionResult` carries no data.
