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
recorded in it under the pristine ref, so the next run has a base.

Behaviour:

1. Git is looked for only when the SDK directory has a `.git` of its own, a folder or a
   worktree's file, or `--git-init` was given. Otherwise the SDK is saved as in phase 0, and the
   run ends with the Next steps box: rerun with `--git-init` before changing anything.
2. Git absent or not answering: warn that it is not available. Older than 2.38: warn, naming the
   version found. Either way the SDK is saved as in phase 0, `.git` included in what the save
   removes, and no next steps are given.
3. A repository counts only when its root is the SDK directory itself. One that only encloses
   it is treated as none, and nothing is written into it. Git that will not say what the
   repository is: Failed, before generating.
4. `--git-init`, or a repository of its own: after the save, `git init` on `main` in the
   directory, say so, record. The save removes any `.git`, so a found repository is made afresh;
   "Found a git repository" and a save that keeps `.git` come with phase 2. A failed init is a
   warning: the SDK is written, nothing recorded.
5. Recording: the generation as a tree of every file, committed under `refs/apimatic/pristine`
   with the CLI as author and chained onto the last snapshot; an identical generation keeps the
   last commit. A failure here is a warning, since the SDK is on disk. Nothing else is written:
   the record file arrives with the phase that first reads it.

Touches: `GitService` with its runner (git's messages in English, nothing else set) and the
methods `version` (a `GitVersion`, none for no git or one that does not answer), `topLevel`,
`init` (git creates the directory and its parents), `treeOf` every file through a temporary
index, `commitTree`, `resolveRef`, `treeOfCommit`, `updateRef`, each failing with git's words as
a string, which the prompts take as `reason`; `GitVersion` total, with `none`, `isFound` and
`isSupported`; `CommitId`, `TreeId`; `GitContext` on the SDK directory: `hasGitDirectory` (a
`.git` of its own, read without git), `isRepository(git)` (as that git sees it; false, with no
git run, without a `.git` or a git that can serve), `recordSnapshot`, with the pristine ref a constant of the module
(since Phase 4's refactor, the questions a run asks of a repository, the operation under way, the
unmerged paths, the record and its snapshot, are answered together by `inspect` as a `RepositoryState`);
`SdkContext` as in phase 0; no run flag reaches a context, and `execute` combines the facts: the
version is read only with a `.git` of its own or `--git-init`, and the run records only with a
usable git; the `--git-init` flag; the prompts for the two warnings, the initialised message, the
Next steps, the failed init, a failed recording, and a repository git would not inspect.

Left for the phase that first reads them: `.apimatic/generation.json` (phase 2) and its
attributes (phase 5), trees with line endings normalised and the runner's `-c` settings
(phase 2), `GIT_DIR` cleared for a run from a hook (phase 6), the ESLint rule for the pure
modules (phase 8).

Tests: `generate-destination.test.ts` (git absent or old, not looked for, the repository cases,
the recording and its failures); `sdk-context.test.ts` as in phase 0; `git-context.test.ts`
("hasGitDirectory", "isRepository", "recordSnapshot"); `git-service.test.ts` (`version`,
`topLevel`, `init`, `treeOf`, the commit, ref and tree round trip); the prompts tests for the
messages added; `git-version` (none included) and `object-id` value-object tests. Helpers:
`test/helpers/sdk-generation.ts` (a stubbed generation) and `test/helpers/snapshots.ts` (a
commit described and its files, through git itself).

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
   "Found a git repository" is said only by the first run to record in it, the one that finds
   no record; a later run, merging or recording afresh, no longer says it.
   A run that merges does not ask to overwrite, since it writes only what changed; the question
   stays for every save. The merge needs `.git` to survive the write: the save that keeps it and
   the check that counts every entry but `.git` are `GitContext.save` and `hasFilesBesidesGit`,
   and `SdkContext` is gone.
2. Snapshot the generation (every file) and the directory as it is (its ignore rules honoured,
   except that every path the base holds goes in), both with line endings normalised.
3. Merge the two over the base with `merge-tree`, renames paired both ways. From git's merge
   and diffs, know every file to write and remove, each conflict and its kind, and what
   happened to every other file: added, updated, merged, removed, kept.
4. Keep the directory as it is, byte for byte, under `refs/apimatic/previous`.
5. Remove before writing. Write markers relabelled "Your changes" and "Generated by APIMatic",
   each file with its own line ending (else the generator's), and skip a file whose bytes would
   not change. Remove the folders a removal leaves empty, below the SDK directory.
6. A write that fails names the file, and the directory is put back from the previous
   snapshot; if that fails too, the restore command is given. Failed.
7. Record the new generation chained on the base; an identical generation keeps the last
   commit, and `.apimatic/generation.json` names it, written only when changed. Then the
   summary: counts of added, updated, merged and removed files, and the merged and kept files
   by name.
8. With conflicts: list them with their kinds and how to rerun; nothing written. Failed.

Slices: 2.1, done, the record and the save that keeps `.git`: `GenerationRecord` and
`.apimatic/generation.json` written by every recording (the snapshot's message names the
generation) and read before the question, "Found" only on the first record, the
snapshot-missing warning without a remote, init before the save again, the hidden-entries
count, `GitContext.save`, `hasFilesBesidesGit`, `generationRecord` (none when there is no record, the file written by `recordContents`) and `hasSnapshot` (folded into `inspect` with Phase 4's refactor), `SdkContext`
deleted. 2.2, done, the merge: items 2, 3, 7 and 8 and the writes and removals of item 5, the
question skipped, the `--force` replacement and its warning; `GitContext.merge` (both trees,
`merge-tree`, the diffs, the plan) and `write` (removals, then writes whose bytes differ);
`GitService` with the `-c` settings on every call, normalised trees, `treeOfDirectory`,
`listTree`, `readBlobs`, `mergeTree`, `diffTrees`; `RelativeFilePath`, `BlobId`, `TreeEntry`,
the `merge-tree` output types and parser, `ValueMap`, `MergePlan` with `from` and
`hasConflicts`; the `customCodeFailed`, `conflictsNotAsked`, `sdkNotWritten`, `sdkMerged`,
`recordedSdkReplaced` and `snapshotNotRecordedAfterMerge` prompts. 2.3, done, the write made
safe and exact: `GitContext.keepPrevious` (the directory as it is, byte for byte, under
`refs/apimatic/previous`), a step of the run before `write`, which lands the plan (its bytes read
by `merge`) and names the step that failed; the run then puts every path the plan names back
through `restore` and says whether the directory is back, with the restore command when it is not;
`WriteProblem` is the file, operation and reason, `removeEmptyDirectories` after a removal, each file
written with its own line ending else the generator's, the binary rule in `file-content`, and
`GitService.treeOfDirectoryAsIs`.

Touches: `GenerationRecord` and the record file, read by the inspection and written after every
recording; `SnapshotRef` with the previous ref; the runner's `-c` settings and the attributes
file that store trees with line endings normalised; `GitService.hasCommit`, `listTree`, `tree`
of the working tree (normalised and as is), `readBlobs` (contents in the order asked), `mergeTree`, `diff`; `BlobId`,
`RelativeFilePath`, `ValueMap`, the `merge-tree` and `diff-tree` output types and parsers;
`FileService.getBytes`, `writeBytes`,
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
`merge-plan.test.ts` for writes, deletes and the summary; `file-content` rules;
`generation-record` and `snapshot-ref` value-object tests; sdk-repository-context "the
generation record" (written beside the snapshot, absent when it cannot be read); git-service
"stores a CRLF file with LF …".

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

Done, in one slice. `ActionResult.actionRequired()` and `isActionRequired()`, the yellow outro,
and `match({ success, failed, cancelled, actionRequired })` in place of `mapAll`;
`GitService.stageConflicts` (a stage-0 entry dropped first, then every stage merge-tree
reported, through `update-index --index-info`), reached through `GitContext.stageConflicts(plan)`
like every other git operation on the SDK directory; `merge.directoryRenames=conflict` pinned
beside `merge.conflictStyle`, so a file added inside a directory the generator renamed follows
it whatever the developer's global config says; `MergedText` in `conflict-markers.ts` (git's
labels read, `id` and `id:path` alike, relabelled with the CLI's, settled for a side line by
line, a malformed sequence leaving the file whole); `conflict.ts` with `Settlement` (how one
conflict lands for a side: what is written and what the summary calls it) and three conflicts
behind one interface, each carrying the stage entries git kept for its path, `MarkedConflict`
for the files git marked, `WholeConflict` for a file a side deleted or a binary one (the
generator's version where it has one, else yours stays), `PlacedConflict` for the other shapes
(git's placement stands); `MergePlan.taking(side)` and `stages` derived from the conflicts,
built from the stage-3 blobs `GitContext.merge` reads beside the merged tree. The only switch
on a conflict's kind is where git's facts become objects. A path git names in a conflict
message that the merge leaves nowhere (neither staged nor written), such as the old name of a
file the generator renamed and you deleted, or of one the merge moved into a directory the
generator renamed, is left out of the conflicts and of the summary: it is no file to settle.
The `conflictChoice` (answering a side, `asPlaced` for the files as git left them, or `cancel`,
which backing out answers too), `conflictsResolved`, `conflictSteps`, `conflictsNotStaged` and
`runCancelled` prompts; `conflictsNotAsked` titled "N files need your attention" and saying how
to rerun. Phase 7's item 3 was pulled forward: `sdk publish` says `conflictsNotPublished` and
ends as Action required when the generation does.

Touches: `ActionResult.actionRequired()` and `isActionRequired()`, the yellow outro and the
fourth `match` handler; `GitService.stageConflicts` and `GitContext.stageConflicts`;
`merge.directoryRenames` pinned; conflict kinds completed (both changed,
both added, deleted by you, no longer generated, binary, other), settling markers for a side,
the plan with a side taken; the `conflictChoice`, `conflictsResolved`, `conflictSteps`,
`conflictsNotStaged` and `runCancelled` prompts.

Tests from `92988f2f`: generate-write "the question when the merge conflicts" group, "writes
markers …", "leaves the merge tool out …"; the merge table's marker cases, "settled for a side"
group, the binary conflict and the two-spec conflicts; `conflict-markers.test.ts`,
`settlement.test.ts` (folded into `merge-plan.test.ts`, since the settlement is
`MergePlan.taking`), `merge-plan.test.ts` for `taking`; `action-result.test.ts`,
`format.test.ts`; the prompts tests about the conflicts; `conflict.test.ts` for the three
conflicts and `Settlement`; git-service `stageConflicts`; publish "publishes nothing, and ends
as Action required …".

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

Slices: 4.1, done, what is in the way: `GitOperation` (a value, none-able) and
`GitService.operationInProgress`, `unmergedStages`, and the block in the action before the record is
read that refuses an operation in progress and lists what is unmerged as Action required; the
`operationInProgress` and `conflictsUnresolved` prompts. 4.2, done, settling what was left:
`UnresolvedFile.settledFor` answering a `Settlement`, `GitContext.settlementFor` as the plan over the
index's two sides and the disk, landed by the same `write` as a merge and followed by
`GitService.unstage`, the question (`unresolvedChoice`, backing out cancels) with `--force` answering
for the generator, and the second look; the `resolveLater` and `conflictsNotSettled` prompts, and
`conflictsResolved` over paths for this run's conflicts and the last run's alike. Refactored with
Phase 3 afterwards: `GitContext.inspect` answers every question a run asks of the repository as one
`RepositoryState`; every plan carries the bytes that reach the disk, line endings decided by `merge`
and `settlementFor`, so `write(plan)` lands any plan; the prompts render what they are handed
(`sdkMerged` given its counts, `conflictSteps` and `conflictStepsByHand` picked by the action).
`repository-facts.test.ts` has `repository-state.test.ts` as its counterpart.

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
failed cases; `.apimatic/.gitattributes` beside the record, merging it as binary and marking
it generated, so a pull that meets a teammate's record leaves no markers in it.

Tests from `92988f2f`: generate-destination "merges in a clone only once the pristine refs
were fetched by hand …", "merges over a clone of an SDK repository named as the destination
…"; sdk-repository-context "sharing" group; git-service "remotes" group except the hooks
cases, "leaves an SSH client the developer configured …", "tells an ancestor from a stranger";
`pristine-chain.test.ts`; sdk-repository-context "is written with attributes that merge it as
binary …" and "stays yours … when a pull meets a teammate's record".

Done, in one slice. `GitService.remoteOf`, `fetchRef` (a remote call: no terminal prompt,
`credential.interactive` off, the default ssh in batch mode unless the developer's own client is
configured, a 30-second limit) and `isAncestor`, with `commitTree` taking any number of parents;
`RemoteName`; `RecordedSnapshot` on the `RepositoryState`, the snapshot the record names with
whether it is held and, once the remote was tried, where else it was looked for as a `SnapshotFetch`
(none, absent, failed); `GitContext.fetchSnapshot`, a step of the run after the refusals and the
unresolved block, which brings the remote's chain over and meets it with the local one in
`meetChains` (adopted, kept or joined; the three outcomes are proven through git in the context's
tests, which stand in for `pristine-chain.test.ts`); `snapshotMissing` wording each outcome through
`match` on the fetch; `.apimatic/.gitattributes` written beside the record by every recording, and
the whole `.apimatic/` directory kept out of "yours" by `merge`.

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

Touches: `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` cleared from the environment of every
git call, since a hook runs the CLI with its own repository in the environment;
`GitService.hooksDirectory`, `hooksPathConfigured`, `hooksRunFrom`;
`FileService.makeExecutable`; the script and the marked block as constants; the hook decision
as a pure rule; the `shareHookInstalled`, `shareHookNeedsOneStep` and `shareHookNotInstalled`
prompts, and the recording notice that chooses one message.

Tests from `92988f2f`: generate-write "the hook that shares snapshots" group;
sdk-repository-context "the hook that shares snapshots" group (writes once, elsewhere, under
the home directory, quiet once it calls, another language, shares on push, through husky, a
clone that never ran the CLI, joins at push time, the server's words, ahead of an existing
hook); git-service hooks cases; `share-hook.test.ts`, `recording-notice.test.ts`.

Done, in one slice. `ShareHook` (`src/types/sdk/share-hook.ts`) holds the call line, the markers
and the script's name beside the rule, `found`, which reads the facts first (the hook as found on
disk, git's own hooks directory, where git runs hooks from, the repository) and answers one of five
outcomes, each holding the one call to its handler for `match` (calling, written, elsewhere,
notShell, notWritten) and, through `toWrite`, the content for the hook file when this run writes
it; `fileIn` names the `pre-push` beside husky's `_`. `GitContext.shareOnPush`, a step of the run
after each recording, writes the script (its text beside the attributes in the context, joined line
by line, standing aside when the push carries the ref itself) and the hook as the rule says, and
answers how the hook was left, a hook that could not be written included, since nothing about it
stops the run. `GitService.hooksDirectory` and
`hooksRunFrom`, with `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` cleared from every call;
`FileService.makeExecutable`; the one `shareHook` prompt wording each outcome, a hook already
calling the script as nothing. `recording-notice.test.ts` has no counterpart: the action picks
nothing, the value does.

### Phase 7: `sdk publish` keeps edits too

Behaviour:

1. `sdk publish` run with flags always passes `--git-init` and never asks. Run without flags, or
   with `--git-init` alone, it is the step-by-step experience, which asks for the SDK directory
   after the language and passes the flag on.
2. The upload holds what git would commit: not `.git`, not `.apimatic`, and not what the SDK's
   own ignore rules keep out. Outside a repository of its own, everything but `.git` and
   `.apimatic`.
3. A generation that ends as Action required publishes nothing, and says the SDK still has
   conflicts. Done in phase 3.

Touches: `GitService.ignoredBelow`; `RelativeDirectoryPath` and `RelativePaths`;
`ZipService.archiveWithout` and `TempContext.zipWithout`; the `--git-init` flag on publish and
the interactive-mode rule; the `conflictsNotPublished`, `dryRunNotice` and
`destinationContainsSource` wording on the publish prompts.

Tests from `92988f2f`: `publish.test.ts` ("uploads the SDK without the CLI's record …",
"publishes nothing, and ends as Action required …", "reports an SDK it could not zip …"),
`publish-flags.test.ts`; sdk-context "archive" group; git-service `ignoredBelow`;
`zip-service.test.ts` for the exclusions; `relativeDirectoryPath.test.ts`.

Done, in one slice. `RelativeDirectoryPath` (`src/types/file/`) beside `RelativeFilePath`, with
`RelativePaths` holding files and directories below one root; `ZipService.archive` and
`TempContext.zip` take what to leave out, nothing by default, the zip service's helpers as module
functions; `GitService.ignoredBelow`, `ls-files` for what the ignore rules keep out below a
directory, a directory ignored whole as one entry. `GitContext.archiveForUpload(git, tempDirectory)`
stands beside `save` as its mirror: a save keeps `.git`, an upload leaves `.git` and the record out
and, in a repository of its own, what git's ignore rules keep out (`keptOutOfUpload`); outside one
git is not asked. The publish action reads git's version as generate does, when the directory has a
`.git`, and hands it over, so a `.git` without a usable git uploads everything but the two. `sdk
publish` takes `--git-init`, passed through in guided mode (`SdkPublish.isGuided`: no flags, or
`--git-init` alone) and always on with flags; `FlagsProvider.sdkForce` words `--force` for both SDK
commands as the docs do; `dryRunNotice` says what the directory holds and what an upload leaves
out; `sdkNotZipped` takes the reason.

### Phase 8: docs and leftovers

1. `CONTEXT.md` gains the terms: SDK directory, pristine snapshot, generation record, custom
   code.
2. The design document `.ai/plans/custom-code.md` from `533bcf1a` comes back with sections 9 and
   10 rewritten for the layout the phases produced; the decisions and the lab cases stay.
3. The `--git-init` flag's description becomes "Track the SDK directory with its own git
   repository so your customizations survive regeneration." and the README is regenerated; the
   convention notes land in the `.ai` instructions and skills, and an ESLint rule keeps the pure
   modules under `src/types/git/` free of file and process access, if wanted.
4. Optional, to decide at review: the cleanups the first attempt carried that are not this
   feature. The plugin action and the not-found hooks reading the terminal check instead of
   `process.stdin.isTTY`; the unused methods on the config, plugin, portal, spec and file
   classes; the error map on `ServiceError`.

Done, in one slice. `CONTEXT.md` names the SDK directory, the pristine snapshot, the generation
record and custom code; `.ai/plans/custom-code.md` is back from `533bcf1a` and made true for this
branch (its phases in §8, the files in §9, the architecture in §10, every name the first attempt
had replaced, a reversed decision amended with its date); the four SDK flag descriptions say what
their rows in the docs' CLI Reference say, `--force` through `FlagsProvider.sdkForce`, both
commands carry the docs' sentence on keeping your changes, the README names git under
Requirements and is regenerated; the conventions these phases followed are in
`.ai/instructions.md` and the skills; an ESLint rule keeps `src/types/sdk`, `src/types/git` and
`src/types/file` free of file, process and infrastructure imports; `terminal.isInteractive()` is
the one TTY check (the plugin action, the not-found hooks and portal serve read it, the plugin
prompts' `canAsk` gone); `PluginConfigContext.hasNoSourceRepository`, which only a test called, is
gone, as is `ServiceError`'s error map, which nothing read.

## 4. Questions each phase will raise

Each is asked when its phase reaches it, with these options. An answer written here ahead of
time saves the question.

**Phase 0: the run's inputs.** The action takes `force` today.

- One `RunMode` value (`force`, whether a question can be asked, later `gitInit`), built by
  the command. For: one argument, and the publish actions build it the same way. Against: a
  type for three flags.
- Separate parameters. For: nothing new. Against: every caller changes with every phase.

**Phase 1: where the inspection lives.** Answered, after three reviews of the first cut:
`GitContext` is git on the SDK directory: `hasGitDirectory` (disk), `isRepository(git)` (as the
git it is handed sees it; false, with no git run, when there is no `.git` or that git cannot
serve) and `recordSnapshot`; `GitService.version` answers a `GitVersion`, none for no git, and
`execute` reads it only when the run needs git, holding `GitVersion.none()` otherwise, so every
fact in the action is a `const` and no run flag reaches a context. A second cut had
`repository()` fold the availability into its answer, which gave two types the same
`gitUnavailable` case; a third had `availability` and `isRepository` side by side, with two
`let`s in the action to carry what each branch learnt; handing the version to `isRepository`
removed both.

**Phase 1: the repository as a fact.** Answered for now: `GitContext` is built on the directory
whether or not it is a repository, and `isRepository(git)` answers which; the root is the SDK
directory itself. To revisit at the end of phase 2, when the merge, the record and the
settlement show whether the seam between the two contexts holds.

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
  chosen. Against: every `mapAll` caller gains a callback. Taken, with `mapAll` renamed
  `match` over named handlers, so a caller that leaves one out fails to compile.
- Reuse `failed` with a message. For: no new kind. Against: `sdk publish` could not tell a
  conflict from a failure, and the outro would be red for a run that did what was asked.

**Phase 6: where the hook text lives.** The script and the marked block are constants that the
pure decision and the installer both read.

- Beside the hook decision in `src/types/sdk/`. For: the decision tests read them. Against: a
  shell script as a TypeScript constant among pure functions.
- In infrastructure, beside the git service. For: it is git's hooks directory. Against: the
  decision would import infrastructure, which the ESLint rule forbids.

Answered: the script's text in `git-context.ts` beside the record's attributes, where the shell
writes it and the pristine ref is; the call line, the markers and the script's name in
`share-hook.ts` with the rule, which is all the rule and the prompt read.

**Phase 7: where the upload rule lives.** The upload holds what git would commit, without `.git`
or the record.

- On `GitContext` beside `save`, as `archiveForUpload(git, tempDirectory)`. For: the two file
  rules of the directory (what a save keeps, what an upload leaves out) share one class and its
  constants, and the repository check is there; the publish action reads git's version as
  generate does and hands it over. Against: the name `GitContext` undersells a class that also
  saves and zips the directory.
- An `SdkContext` over `GitContext`, as the injection branch had. Against: the split Phase 1
  folded; the archive still needs the repository check and the ignore rules from the other class.
- The context asking git itself, with no version handed in. Against: a `.git` without a usable
  git fails the upload where generate only warned.

Answered: the first, one context.

**Phase 8: the leftovers.** Four cleanups the first attempt carried that are not this feature.

- All four: the ESLint purity rule over the three pure directories, one terminal check, the
  unused method a reference scan finds, `ServiceError` without its error map. For: what the
  review already judged lands with the feature. Against: files outside the feature in its PR.
- The rule and the terminal check only. Against: two known leftovers stay.
- None. Against: the review's findings are lost.

Answered: all four, with `--force` brought to the docs' row as well as `--git-init`, and the git
sentence on both commands and under the README's Requirements.

## 5. Out of scope

As the first attempt decided: an ignore list for frozen files, patch files, code regions,
portal downloads that include custom code, and any push by the CLI itself. Telemetry for
conflicts is not sent; the `ActionResult` carries no data.
