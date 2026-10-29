# Plan: keep your edits when regenerating an SDK

Status: implemented on branch `asadali214/custom-code-injection`, cut from `dev` at
`4baa9485`, in nine phases reviewed one by one between 2026-10-20 and 2026-10-22, then
reworked on review (section 8 lists the commits, the review follow-ups included); PR #445
into `dev`, under review. Section 10 is the architecture, layer by layer;
section 11 lists what still needs a decision. The design was tested against Speakeasy's
generator first; section 7 records what that lab measured and what this plan does on the
same cases, and the APIMatic Customization Lab replays them on the real CLI.

## 1. Goal and scope

A developer edits a generated SDK, any file and any line, and regenerates it with the same
command; their edits survive, the generator's changes arrive, and the two are merged file by
file with git's three-way merge. Nothing to configure, no markers or regions to stay inside,
no commit required before regenerating.

What changes for the developer:

- **Git is required.** The CLI uses the git on `PATH`, 2.38 or newer, for the snapshots and
  the merge. Without it `sdk generate` behaves exactly as before, writes no `.git` and no
  `.apimatic/`, and warns: "git was not found, so your customizations to the generated SDK
  will not persist across regenerations".
- **First run**: as before, a spec and a language; the SDK lands in `<project>/sdk/<language>`,
  or in the `--destination` itself when one is named, with no language directory added below it.
  If that directory is not a git repository of its own, `--git-init` makes it one; without the
  flag the SDK is written without one and a warning says edits will not persist. A repository
  that only encloses the directory, such as the project's, is never used.
- **A clone**: `--destination` naming a clone of an SDK repository regenerates over the clone,
  and merges when the clone holds a generation record. A destination holding the project's
  `src` is refused, since the SDK directory is emptied before a write that does not merge.
- **Regenerate in place**: the same command. Generator changes are merged into edited files,
  new files are added, files the generator stopped producing are removed when unedited.
- **Conflicts are explicit**: overlapping changes are listed before anything is written, and a
  terminal run asks how to settle them (6.1); `--force` takes the generator's changes. Resolving
  by hand leaves git-style markers, put in git's index for a merge tool. Resolve, rerun.
- **Teams**: the first recorded run installs a `pre-push` hook, and from then on every push
  of a branch also pushes the snapshot refs; a clone fetches them before merging. The CLI
  never pushes (3.2).
- **No base, no merge**: an SDK directory with no generation record, or whose recorded
  snapshot is missing, gets the "overwrite?" question as before; the run then records a
  snapshot so the next one merges.

Terms, also in `CONTEXT.md`: the **SDK directory** is the directory the CLI writes into (the
`--destination` as named, else `sdk/[<api-version>/]<language>`), input and output of every later run; the **repository** is the SDK
directory's own git repository, rooted at it; a **pristine snapshot** is one generation's output exactly as the
server returned it, stored as a commit under a hidden ref; the **generation record** is
`<sdk>/.apimatic/generation.json`, naming the snapshot the directory was last written from;
**custom code** is whatever differs between the SDK directory on disk and its snapshot.

Out of scope: an ignore list for files the developer wants frozen, patch files, code regions,
portal downloads that include custom code (section 11), and any push by the CLI itself.

## 2. Decisions

| Ask | Decision | Why |
|---|---|---|
| Where the merge runs | In the CLI, against the working tree. The server is unchanged. | Nothing is uploaded or downloaded beyond the SDK zip, the merge sees uncommitted edits, and the design matches Speakeasy's, which the lab showed working. |
| When it merges | Always, whenever git is available, the SDK directory is a git repository of its own and has a generation record. No switch in `apimatic.json`. | One rule to explain: "with git installed, your edits are kept". A switch would be read only after the first edit is already lost. |
| Git is a hard requirement | The system git, 2.38 or newer, found on `PATH` at the start of every run. Absent or older: today's flow, no `.git` or `.apimatic/` written, one warning. No bundled fallback engine. | Git's merge is the reference everyone else measures against: rename detection, modify/delete and add/add semantics, binary handling. Generators that embed a library write their own diff3 (Speakeasy, isomorphic-git); tools that accept git as a prerequisite shell out to it (JHipster, Copier, Cruft); none reimplements rename detection. 2.38 (October 2022) is the first with `merge-tree --write-tree`. |
| No repository | `--git-init` makes the SDK directory a repository: `git init -b main` there after the generation succeeds and before the first write, reported afterwards. Without it the SDK is written without a repository, with one warning naming the flag, exit 0, however the run started (decided 2026-10-29 on the product review, replacing the question of 2026-10-27). `sdk publish` always passes it when run with flags, and takes `--git-init` in its step-by-step experience. A non-empty directory without a repository is asked "overwrite?" first. | Without a snapshot of the first generation there is nothing to merge against later, but a repository nobody asked for inside `sdk/<language>` trips `git add .` once the project becomes a repository of its own, and CI should never get one by surprise. A flag says so up front, where the question could not be answered in CI at all. |
| Only the SDK directory's own repository | A repository counts only when its root is the SDK directory. One that encloses it from above, the project's or any other, is treated as none: nothing is written into it, no refs, no hook (decided 2026-10-29 on the product review). | The CLI should not keep refs and a hook in a repository the developer keeps for something else. The cost: inside a project repository, `--git-init` makes the SDK directory an embedded repository, which the project then tracks as a gitlink rather than as files. |
| Repository found but no record | Ask "overwrite?" as before (skipped by `--force`); then record a snapshot, saying once that the repository was found. | An SDK generated by an older CLI, copied in, or built from the portal has no base. |
| Record for another generation | A record for another stability (or generator) is "no base": the overwrite question, then a fresh snapshot. No warning about what the directory holds (removed 2026-10-29 on the product review). | Merging a beta generation over a stable base would be a merge of everything; replacing is what the developer asked for. |
| Remote | Read only by the CLI, and only when a record names a commit the repository lacks. Writing is the developer's `git push`, through a `pre-push` hook the CLI installs (decided 2026-10-22, replacing the push inside the CLI). | A snapshot pushed by the CLI reached the remote before the branch that records it, and never when the push failed or the remote came later; the hook ties the snapshot to the push of the branch, so the two arrive together, every time. |
| Merge engine | `git merge-tree --write-tree` between two temporary commits (yours and the generation) that share the pristine snapshot as parent, run with the CLI's own `-c` settings. The CLI reads the result and writes it into the SDK directory. | No merge code to maintain; git supplies the three-way merge, rename detection and every conflict shape, without touching the working tree, the index or any branch. |
| Branches | None. Snapshots are commits under `refs/apimatic/…`, never checked out, never on a branch. | The CLI should not create or switch branches in someone's repository. The base for a run is the one the committed record names, so each branch carries its own. |
| Moves and renames | Git's rename detection, both ways, at its usual 50% similarity. | The lab's case 6 lost edits because Speakeasy relies on a header comment; git pairs by content. |
| Same path added by both | A conflict, unless the contents are identical. | Git semantics; Speakeasy overwrites the developer's file silently. |
| Generator drops an edited file | A conflict: the file stays, listed as "no longer generated". | Lab case 7: Speakeasy deletes it with no warning. |
| Developer deleted a file the generator changed | A conflict: the new version is written back and listed. Needs sign-off, section 10. | Git semantics. The alternative, remembering the deletion, is silent and recurs on docs files. |
| `--force` | Keeps its meaning: never ask. On conflicts, this run's or those the last run left unresolved, it takes the generator's changes, as "Resolve using generator changes" does (decided 2026-10-29 on the product review). A recorded SDK it cannot merge into, whose record names another generation or a missing snapshot, is replaced, with one warning after the write that the customizations were not carried over (decided 2026-10-29, replacing the refusal). | CI runs already pass it, and a forced run should end with an SDK that builds. What a replacement drops, the developer's commits still hold. |
| Undo | Not offered by the CLI (decided 2026-10-23). The SDK directory as it was before the run is still kept under `refs/apimatic/previous`, overwritten each run, for a developer to restore by hand. | The first question can cancel before anything is written, so a way back is needed only after a run that could not ask; the ref covers that at the cost of one commit per run. |
| Conflicts in git's index | The conflicted paths are put into the repository's index at stages 1, 2 and 3. | `git status` says "both modified" and `git mergetool` opens them, as after a merge git ran itself. |
| One action | `GenerateAction` is the whole run: no `SdkPrepareAction`, no `SdkWriteAction` (decided 2026-10-22). | Each phase had one caller and could not run alone, and passing `SdkDestination` between actions through `ActionResult.getValue()` put data on a result that is meant to carry only an outcome. |
| Functional core, imperative shell | `execute` is the script of the run, read top to bottom, and the only place that speaks: every question and message is a `this.prompts.*` call in it, and the action has no other method. The prompts word the data they are handed: they may switch exhaustively on a union the core already decided (a notice, a refusal, a recording outcome, the next steps), and never derive a fact or a policy of their own; where a message depends on an outcome, the core answers with that outcome as data (amended 2026-10-28 on review). The I/O is on the contexts (`SdkContext.destination`, `SdkRepositoryContext.regenerate` and `write`); the decisions are pure functions in `src/types/sdk/`: `destinationFor`, `replacesDirectory`, `resolving`, `favouring`, `MergePlan.taking`, `settledContent` (decided 2026-10-22). | The reader of `execute` sees what is asked and said, and when, without a hop; what a repository state or a conflict choice means is testable without git or a terminal; the contexts stay silent, so they can be composed. |
| Telemetry | None for now. `SdkMergeConflictedEvent`, `ConflictOutcome` and the result's payload are gone; `execute` returns a plain `ActionResult` (decided 2026-10-22). | An `ActionResult` carries no data. Conflict counts can come back later through a callback the command hands the action, as `sdk publish` does with `onPublishSdkError`. |
| Two contexts | `SdkContext` is the directory of this run; `SdkRepositoryContext` is that directory once git says it is a repository of its own, and holds everything that needs the root. They stay two classes (decided 2026-10-22). | A first run's directory may not exist and may have no repository, so finding the repository can answer "none". One class would make every snapshot method begin by asking for a root that may not be there, or hold a mutable "opened" state; the second class makes "a repository was found" a fact the type carries, checked once. |

## 3. What is saved, and where

Two hidden refs in the SDK directory's own repository plus one small file inside it (one SDK
directory per repository since 2026-10-29, so the refs carry no path).

| Item | Holds | Written | Shared |
|---|---|---|---|
| `refs/apimatic/pristine` | A chain of commits, one per generation. Each tree is that generation's output exactly as unzipped: no `.git`, no `.apimatic/`, no developer files. | After every successful write, with plumbing: the generated directory is added to a temporary index (`GIT_INDEX_FILE`, `--work-tree`), then `write-tree`, `commit-tree` and `update-ref`. Author "APIMatic CLI <developer@apimatic.io>", message `apimatic: pristine typescript v4 stable`. | Pushed to the remote after every recorded run; fetched by a run whose record names a commit the repository lacks (3.2). |
| `refs/apimatic/previous` | One commit, no parent: the SDK directory as it was on disk the moment before the last run wrote to it (`.git` excluded). | Before the merge writes anything. Overwritten each run. | No. Local safety net: `git restore --source=refs/apimatic/previous --worktree -- .`, run in the SDK directory, puts the files back, record included (verified in the lab, case 15); files the run added stay and `git status` lists them. |
| `<sdk>/.apimatic/generation.json` | `schemaVersion`, `language`, `codegenVersion`, `stability`, `pristine` (the commit the directory was written from); nothing that changes from run to run, so a regeneration that changed nothing leaves it untouched (`generatedAt` and `cliVersion` dropped 2026-10-27 on review; older records still parse). The files a run leaves in conflict are not in it: they are git's unmerged index entries, the only state that says when the developer has resolved them. | After the pristine commit exists, so the two never disagree; `.apimatic/.gitattributes` (`generation.json merge=binary linguist-generated=true`) first, each only when its content changed. | Yes: an ordinary tracked file, committed with the SDK. It is what makes a branch, a worktree or a clone merge against the right base. The attributes keep a pull where two clones both regenerated from writing markers into it (section 11). |

### 3.1 Which snapshot is the base

The commit named in the generation record on disk, never the ref's tip. The tip only says
where the chain continues. If the named commit is absent locally, the CLI fetches the ref from
the remote (3.2) and looks again; if it is still absent, it says so and why (no remote, the
remote lacks it, or the fetch failed and how), and offers to overwrite instead, which records a
fresh snapshot. The commit id and the ref are not shown: nothing in the message is for the
developer to act on beyond the question that follows.

### 3.2 Sharing through a pre-push hook

The snapshot reaches the remote at the same moment the record does: when the developer pushes
a branch. After every recorded run the CLI writes two things into git's own hooks directory
(`git rev-parse --git-common-dir`, so worktrees share it, whatever `core.hooksPath` says): the
script, `apimatic-pre-push` (`SHARE_HOOK_SCRIPT` in `src/types/sdk/share-hook.ts`, rewritten
only when its content changed), and a three-line marked block in `pre-push` that calls it
(`# >>> apimatic snapshots` … `# <<< apimatic snapshots`): a fresh hook when there is none,
right after the shebang of an existing shell hook (so an early `exit` below cannot skip it),
and left alone when the block is there. The run that writes
the call into the hook says so, once; later runs are silent about it (decided 2026-10-27 on
review). The CLI never pushes.

The call is one line that finds the script through git, does nothing where the script is not
there (a clone that never ran the CLI) and never fails the push:
`f="$(git rev-parse --git-common-dir)/hooks/apimatic-pre-push"; [ -f "$f" ] && sh "$f" "$@" || true`.
That is what makes the other cases a one-step note rather than a warning with nothing to do.

The script, for the remote git passes as `$1`: push `refs/apimatic/pristine`, when there is
one, with `--no-verify` (so the push inside the hook does not re-enter the hook) and
`GIT_TERMINAL_PROMPT=0`; when that is rejected, fetch the remote's chain with
`+refs/apimatic/pristine:refs/apimatic/remotes/<remote>/pristine`, fast-forward or join the
local chain with a two-parent commit (`apimatic: pristine chains joined`), and push again. A second failure prints one line in the server's words; the script
always exits 0, and runs in its own `sh`, so a hook's `set -e` cannot be tripped by it. The
common push costs one extra push of small refs; the fetch happens only when another machine
pushed first.

A tracking name, not the local chain, is what the fetch writes to: a plain
`refs/apimatic/pristine` refspec made a diverged chain reject the fetch and `git pull` skip
its merge, and a forced one would strand unpushed snapshots.

When `core.hooksPath` is set, the CLI does not write the hook (husky regenerates `.husky/_` on
install, and the team's versioned `.husky/pre-push` is theirs). The run shows a next-steps note
naming the file that hook runs (`.husky/pre-push` for a hooks path ending in `_`, else
`<hooksPath>/pre-push`) and the line to add; once that file mentions the script, the note
stops. The same note, without the commit step, when the existing `.git/hooks/pre-push` is not
a shell script.

The CLI's only remote operation is the fetch inside `inspect`, when the record names a commit
the repository lacks: from the branch's remote (`branch.<name>.remote`) else `origin`, without
prompts, with a 30-second timeout, and joining the local chain when it had diverged. A
snapshot that is nowhere is reported as missing and the run asks before replacing.

### 3.3 Rules

- Only a repository rooted at the SDK directory holds its snapshots. An SDK directory inside
  another SDK's repository is, for the CLI, a directory without one (decided 2026-10-29,
  replacing the refusal of a nested SDK directory, which per-path refs needed).
- `.git/` is never part of a snapshot. `.apimatic/` is in a previous snapshot (so a restore
  by hand puts the record back too) but never in a pristine one, and the merge leaves it
  alone since only the disk side has it.
- A snapshot of the disk honours the SDK's own `.gitignore` (so a `node_modules` or `dist`
  never enters a tree), except that every path the pristine snapshot holds is added
  regardless, so a generated file an ignore rule happens to match is still seen and never
  mistaken for one the developer deleted.
- The developer's git configuration is bypassed: every git call runs with
  `-c core.autocrlf=false`, `-c merge.conflictStyle=merge`, `-c merge.renormalize=true`,
  raised rename limits, `gc.auto=0`, a temporary attributes file holding `* text=auto`, and
  `LC_ALL=C`, so two machines produce the same trees and the same markers and git's messages
  stay parseable.
- Snapshots are ordinary git objects: deduplicated, packed by the developer's own `git gc`,
  invisible to `git log` and to a plain `git push`.
- `.apimatic/` never ships inside a published package: the three v4 generators' manifests are
  whitelists that do not name it (verified 2026-10-20, section 10).

## 4. One run of `apimatic sdk generate`

### 4.1 Before this plan

The destination was checked before anything was uploaded, and a non-empty one was emptied
before the fresh SDK was copied in. Nothing on disk survived a regeneration.

### 4.2 With this plan

```mermaid
flowchart TD
  A([apimatic sdk generate -l typescript]) --> V{git 2.38+ on PATH?}
  V -- no --> V1([Warn: customizations will not persist; today's flow, no .git, no .apimatic])
  V -- yes --> D{Generation record and its pristine commit found?}
  D -- no, directory empty --> C1
  D -- no, directory not empty --> F{Overwrite? / --force}
  F -- no --> X([Cancelled, nothing touched])
  F -- yes --> C1[Zip src/ and upload; poll; download the SDK zip into a temp directory]
  C1 --> R1[git init in the SDK directory with --git-init, when it is not a repository of its own]
  R1 --> E[Write the SDK; an overwrite empties the directory but keeps any existing .git]
  D -- yes --> G{Files still unmerged from the last run?}
  G -- yes --> Y([Asked in a terminal, settled for the generator under --force, else Failed: resolve those files first])
  G -- no --> C2[Zip src/ and upload; poll; download the SDK zip into a temp directory]
  C2 --> H[Save disk state to refs/apimatic/previous]
  H --> I[git merge-tree of yours and the generation over the pristine base; write the result in place]
  E --> J[Record pristine commit; write generation.json]
  I --> J
  J --> K{Conflicts?}
  K -- no --> S([Success: summary of files])
  K -- yes --> T([Success: the developer resolves by hand; markers, and what to do])
```

The run is one action, `GenerateAction.execute`, read top to bottom; every question and
message is in it (section 10). It validates as before, then `SdkContext.destination` says
how the SDK will be written, before the upload:

1. `git --version`. Absent, or older than 2.38: warn that customizations will not persist;
   `overwrite`, writing no `.git` and no `.apimatic/`.
2. `SdkContext.repository()` finds the SDK directory's own repository: git's top level from the
   directory (or its nearest existing ancestor, since a first run's directory is not there
   yet), counted only when it is the directory itself; then `inspect`: a merge, rebase,
   cherry-pick or revert in progress is refused, files git still holds as unmerged come next, and only then the record and whether its commit is
   present.
3. No repository, no record, a record for another generation, or a missing commit: `record`
   (`init` or `save` without a repository, by `--git-init`). Unmerged files: asked about,
   settled for the generator under `--force`, or refused without a terminal (6.1). Otherwise
   `merge` against the recorded base.
4. The overwrite question is asked for `overwrite` and `record` when the save would remove
   anything from the directory, never for `merge`, and never with `--force`. Every entry but
   `.git` counts, hidden ones included, since the save keeps only `.git`: a repository of the
   developer's own that holds only `.github` or `.husky` is asked about, one that holds only
   `.git` is not (`SdkContext.exists`, `FileService.hasEntriesExcluding`).

It asks the overwrite question, uploads, polls and downloads into a temp directory as
before, and puts the SDK in place the way the destination says:

- `overwrite`: today's save into the directory; a `.git` in it stays.
- `record`: `git init -b main` in the SDK directory when it is not a repository of its own and
  `--git-init` was given (after the generation succeeded, so a failed one leaves no repository
  behind), the save, then the pristine commit and the record; "Found a git repository" when the
  repository was already there and held no record. Without the flag, the save alone, as
  `overwrite`, with the warning. A failure to record is a warning: the SDK is on disk, and the
  next run asks before replacing it. With `--force`, a directory whose record names another
  generation or a missing snapshot is replaced all the same, and the run warns after the write
  that the customizations were not carried over and that git still holds the committed ones
  (`warnReplacedRecord`, `recordedSdkReplaced`): `--force` answers for the developer.
- `merge`: `SdkRepositoryContext.regenerate` (the generated tree, the disk tree,
  `merge-tree`) into a `Regeneration`; its conflicts settled into a `Settlement` (6.1);
  `SdkRepositoryContext.write` (the previous ref, then the writes and deletions: only paths
  whose content differs between the disk and the merged tree; the directory is never emptied);
  the pristine commit and the record; the summary. With conflicts: the stages into the index,
  the conflict block, and a failed result.

## 5. The merge, file by file

Three trees: base (the pristine snapshot), yours (the SDK directory on disk, snapshotted as
in 3.3) and new (the fresh generation). Yours and new are written as temporary commits whose
parent is the base, so `git merge-tree --write-tree yours new` finds the base itself and
returns a merged tree, the conflicted paths with their stages, and one informational line
per conflict naming its kind. The CLI does none of the deciding:

| Base | Yours | New | Action |
|---|---|---|---|
| absent | absent | present | Write it (new generated file). |
| absent | present | present | Identical: nothing. Different: conflict add/add, markers around both versions. |
| present | = base | present | Write the new version (you never edited it). |
| present | edited | = base | Keep yours (the generator did not change it). |
| present | edited | = yours | Nothing. |
| present | edited | changed | Three-way line merge. Non-overlapping: write the merged file. Overlapping: conflict markers. |
| present | absent | = base | Stays deleted. |
| present | absent | changed | Conflict "deleted by you, changed by the generator": the new version is written back and listed. Section 10. |
| present | = base | absent | Delete it (the generator no longer produces it). |
| present | edited | absent | Conflict "no longer generated": your file stays and is listed. |
| present | absent | absent | Nothing. |
| absent | present | absent | Your own file: never touched. |

Renames: git's detection on both sides at its default 50% similarity, with `merge.renameLimit`
raised. The generator renamed a file: your edits are merged into it at the new name and the
old name is removed. You moved a file: the generator's change to the old name is merged into
your file where it is now. A file both sides renamed differently is a rename conflict git
reports; the CLI lists it with git's message, and both candidates stay on disk.

Content: trees are stored with `* text=auto` and merged with `merge.renormalize`, so a CRLF
file and its LF counterpart compare as equal and merge line by line; a file the merge changes
is written with LF, a file it leaves alone keeps its ending. Binary files are git's binary
files: unedited ones are replaced, edited ones are kept, and an edited one the generator also
changed is a conflict that keeps yours.

## 6. Conflicts

The merge finishes for every file; a conflict in one file does not stop the others. A line
conflict is written into the file, with git's labels (the temporary commit ids) replaced as
the file is written:

```
<<<<<<< Your changes
 * Price in USD, VAT included.
=======
 * Retail price in US dollars.
>>>>>>> Generated by APIMatic
```

The other kinds carry no markers: a file no longer generated stays as yours; a file you
deleted comes back in its new version; a binary keeps yours. All are listed before the
question in a block, "N files need your attention", each with what happened to it and
nothing about how it will be written (decided 2026-10-29 on the product review). When the
developer resolves by hand, the steps follow the summary: resolve them in a merge tool
(`git mergetool`, or the editor's merge view) or by hand, naming the files with markers (keep
what is right, remove the markers, stage each) and those without (decide whether each stays
or goes, stage that); rerun, nothing needs committing first; or rerun and let the CLI resolve
what is left, using either side. The merge tool is left out when the conflicts could not be
put in the index. Git's own tools apply throughout: `git status` lists the files as both
modified, `git mergetool` opens them, `git add` marks them resolved. The steps do not name
`refs/apimatic/previous`; that ref is the safety net of section 3, named only when a write
failed and could not be undone.

The result is a success, exit 0 (decided 2026-10-29 on the product review): the developer
chose to resolve by hand, and the run did that. A run without a terminal never writes
markers; it stops with the list, failed, exit 1. Nothing is lost: every other file is already
updated, the pristine snapshot is recorded, the index holds the conflicted paths.

The next run: while git still holds any file below the SDK directory as unmerged
(`GitService.unmergedStages`, `ls-files -u`), the run stops before generating and names them
(or asks, 6.1). That is git's own convention: the three stages stay in the index until
`git add` (or a mergetool, or an IDE's accept button) marks the file resolved, and `git commit`
refuses until then. The CLI reads nothing else: not the marker text, which a developer may
legitimately write and which an unstaged resolution still lacks, and not a list in the record,
which would carry a local, transient state in a committed file. Once resolved and staged, no
commit is needed. With the spec unchanged the rerun changes nothing, because new equals base.
With a changed spec it merges onto your resolution.

### 6.1 The questions

Conflicts are settled before anything is written. The plan is computed first (generated
tree, disk tree, `merge-tree`); when it has conflicts, a terminal is attached and `--force`
is absent, the action lists the conflicted files with their kind and asks
(`SdkGeneratePrompts.conflictChoice`, a `select`):

- **I'll resolve them myself**: the run goes on as above, markers, the steps (ending with "Or
  rerun and let the CLI resolve what is left, using either side."), success. `--force` answers
  "Resolve using generator changes" instead, without asking; a run without a terminal stops
  with the list and writes nothing.
- **Resolve using generator changes**: every marked block is settled for the generator's
  side as the file is written (`settleMarkers`, the same code the next run uses on a file
  left unresolved), so only the overlapping hunks go the generator's way and your other edits
  in the same file survive; a file one side deleted, or a binary one, is settled whole by
  `MergePlan.taking('generated')`: the generator's version where it has one, else yours
  stays, so a customized file the generator dropped is never thrown away by this answer.
- **Resolve using my changes**: the mirror image: every marked block keeps your lines and the
  generator's other changes in the same file still apply; a file left whole stays as it is on
  disk, which is your side (`MergePlan.taking('yours')`), so a file you deleted stays deleted
  and a customized file the generator dropped stays. The next run sees your lines as your
  edits and keeps them.
- **Cancel this run**, or backing out of the question: nothing written, nothing recorded, no
  previous ref saved; the result is cancelled. The previous ref is saved only after the
  decision, so this answer leaves no trace.

For either side the merge becomes a `Settlement` (`favouring(side, regeneration)`), which
remembers the files the merge left in conflict so the run can name them, under "Resolved
using …", once they are written; it records a clean snapshot and succeeds. The merge runs
once: `merge-tree -X ours|theirs` would need git 2.43, and settling the markers as the file
is written gives the same result on 2.38.

The next run, while git holds any of the SDK's files as unmerged, asks before generating
(`SdkGeneratePrompts.unresolvedChoice`); `--force` settles them for the generator without
asking, and a run without a terminal gets the refusal as before (`onConflictFor`):

- **I'll finish resolving them**, or backing out: nothing done; the result is cancelled, exit
  130 (decided 2026-10-29 on the product review, replacing a failure).
- **Resolve remaining conflicts using generator changes** and **… using my changes**:
  `SdkRepositoryContext.settleUnresolved(side, paths)` reads the two sides git kept in the
  index (`GitService.unmergedStages`, stage 2 yours, stage 3 the generator's) and settles each
  file with the pure `settledContent`: markers still in it are settled in place for the side,
  keeping every line around them (what you already resolved in that file included); without
  markers, a file one side deleted stays or goes with the side asked for, a binary file takes
  that side's version, and a text file whose markers are all gone was resolved by hand and
  stays. Every file is then taken out of the unmerged state; no network needed.

There is no undo and no cancel on this question (decided 2026-10-23): the first question
already offers the cancel, before anything is written. After either side, the directory is
inspected again, once; a file still unmerged after that is reported, never asked about
twice. The run then generates and merges from the settled state.

Nothing is reported to telemetry (section 2). Whether a question can be asked is
`terminal.isInteractive()` (`process.stdin.isTTY`, `src/infrastructure/terminal.ts`), stubbed
in tests.

CI: with `--force` nothing is asked; conflicts are settled for the generator and listed under
"Resolved using the generator's changes", and a recorded SDK the run cannot merge into is
replaced, with a warning. Without it, conflicts fail the job with the list. A CI checkout
fetches the snapshot it needs by itself; its push back usually fails for lack of a write
token, which is a warning. Opening pull requests is not the CLI's job; an Action that commits
the marked files to a branch for review is a separate piece of work.

## 7. Expected behaviour on the lab's cases

The eleven Speakeasy runs from the lab notebook, plus three the lab did not cover.

| # | Case | Speakeasy (measured) | This plan |
|---|---|---|---|
| 1 | Edit with nothing configured | lost unless the prompt is answered Yes | kept; there is nothing to configure |
| 2 | Edits and spec changes in different places | kept | kept |
| 3 | Same line changed by both | conflict markers, exit 1 | asked first; by hand: conflict markers, stages in the index for a merge tool, pre-run state kept |
| 4 | Developer adds new files | kept | kept |
| 5 | Developer deletes a generated file | stays deleted | stays deleted while the generator leaves it alone; conflict once the generator changes it (section 10) |
| 6 | Developer moves a generated file | lost: rewritten from scratch | kept: matched by content, merged at the new path |
| 7 | Generator drops an edited file | lost: deleted silently | conflict: file kept and listed |
| 8 | `.genignore` frozen file | drifts from the spec | not offered; an ignore list is a possible follow-up |
| 9 | Patch files | replayed every run | not offered; edits in place cover the need |
| 10 | Code regions | kept inside markers, lost outside | not offered; every line is editable |
| 11 | SDK hooks registration file | written once | unchanged: hooks are generator features, merged like any file |
| 12 | Both add the same path with different content | developer's file overwritten | conflict add/add |
| 13 | Generator renames an edited file | lost | kept: edits follow the rename |
| 14 | Fresh clone, regenerate | fails unless the hidden refs were pushed | merges by itself: the generating run pushed the ref, the clone fetches it; a clear message with the commands and the overwrite question only when the push had failed |

Every row of section 5 and this table is a test over real repositories in
`test/types/sdk-repository-context-merge.test.ts`, `test/actions/sdk/generate-destination.test.ts`
(row 14 with a bare remote) and `test/actions/sdk/generate-write.test.ts`, both driving
`GenerateAction` with a stubbed generation service (`test/helpers/sdk-generation.ts`).

## 8. Phases, as delivered

| Phase | Commit | What |
|---|---|---|
| 1 | `db3fe9f2`, reworked in `185e0663` | `GitService` (the system git through `execa`, every call with the 3.3 settings) and the pristine store (since the `SdkRepositoryContext`) with the value objects: refs, commit and tree ids, git version, generation record. |
| 2 | `185e0663` | The merge (since moved onto `SdkRepositoryContext`): the temporary commits, `merge-tree --write-tree -z`, the diffs; `src/application/sdk-merge/` (since folded into `GitService` and `src/types/sdk/`) keeps only what is pure: parsing merge-tree's output, the conflict kinds, marker relabelling, `MergePlan`. |
| 3 | `4d5b9ccf` | `SdkPrepareAction`, `SdkDestination`, `SdkWriteAction`, their prompts, the repository's `inspect`; `GenerateAction` back to validation and generation; `SdkContext.save` keeps `.git`. |
| 4, 5 | `87453917` | The missing-snapshot message with the push and fetch commands; `stageConflicts` through `update-index --index-info`; `SdkMergeConflictedEvent`. |
| 6 | this file | `CONTEXT.md` terms, the README section and requirement, the command description. |
| 7 | 8217ac56 | Sharing through the remote: `GitService.remoteOf`, `fetchRef`, `pushRef`, `isAncestor`; `SdkRepositoryContext.remote`, `shareSnapshot`, the fetch inside `inspect`, chains joined on divergence; the prompts; lab cases for a clone, a refused push, a remote attached after generating, and two diverged machines. |
| 8 | 7c181dfa | Sharing through a `pre-push` hook instead of a push in the CLI: the `apimatic-pre-push` script and the calling block (`ShareHook`), `GitService.hooksDirectory` and `hooksPathConfigured`, `SdkRepositoryContext.installShareHook`, the one-step note; `pushRef` and `shareSnapshot` removed; lab cases for `core.hooksPath` and an existing hook. |
| 9 | 07c03c13 | The conflict questions (6.1): `MergePlan.takingGenerated`, `ConflictChoice`/`UnresolvedChoice`/`ConflictOutcome`, `SdkRepositoryContext.restorePrevious` and `resolveForGenerator`, `GitService.checkoutTree`, `terminal.isInteractive`, the two `select` prompts and their follow-ups, the choice on the telemetry event; the README's custom-code section removed. |
| 10 | this file | Review follow-up: `SdkPrepareAction` and `SdkWriteAction` folded into `GenerateAction.execute`, their prompts into `SdkGeneratePrompts`; `SdkMergeConflictedEvent`, `ConflictOutcome`, `MergePlan.conflictsByKind` and the result payload removed; the two action tests now drive `GenerateAction` through `test/helpers/sdk-generation.ts`. |
| 11 | this file | Functional core, imperative shell: `SdkDestination` carrying its reason, `destinationFor` (`unresolved` included), `replacesDirectory`; `Regeneration` and `Settlement` (`resolving`, `favouringGenerator`); `SdkContext.destination`, `SdkRepositoryContext.regenerate` and `write`; `execute` the one place that speaks, with no other method on the action and no logic in the prompts. |
| 12 | this file | Review follow-up: the conflicts a run leaves are found from git's unmerged index entries (`GitService.unmergedPaths`, `ls-files -u` below the SDK directory), as git itself finds them, instead of a conflict list in the record plus a scan for marker text; `GenerationRecord` drops `conflicts` (older records still parse), `hasConflictMarkers` goes, `restorePrevious` takes the paths to settle, the second-run messages say "unresolved" and the first-run steps say to stage each file. |
| 13 | this file | Review follow-up: "Resolve using my changes" on both questions (`-X ours`, `MergePlan.taking(side)`, `favouring(side, …)`, `resolveMarkers(content, side)`), the first question's third answer renamed "Cancel this run", and the second question's undo removed with `restorePrevious`, `previousRestored` and `GitService.checkoutTree`; the second run settles files without markers from the index's stages (`GitService.unmergedStages`, `settledContent`). It removed a customized file the generator dropped for the generator's side; row 15 reversed that, and dropped `-X`. |
| 14 | this file | Review follow-up: `.apimatic/.gitattributes` written beside the record (`RECORD_ATTRIBUTES`), so a pull where two clones both regenerated leaves the puller's record whole instead of writing markers into it; a test pulls between two real clones. |
| 15 | `f7b52fc8` onward | PR #445 review: removals before writes, and the directory put back from the previous ref when a write fails (`NotApplied`); the generator's side keeps a customized file it no longer produces (`chosen`); every label git writes on a marker is read, a half-resolved file is left whole, a non-UTF-8 file settles byte for byte; any SDK path is recorded (ref segments percent-encoded), every byte of a blob is kept, files are written with their own line endings; a run refuses over unmerged files before reading the record, over a merge, rebase, cherry-pick or revert in progress, and treats an ignored SDK directory as having no enclosing repository, with `GIT_DIR` cleared from every git call; no `merge-tree -X` (settled at write time, floor stays 2.38), a configured SSH client left alone, `core.hooksPath` resolved by git; `sdk publish` uploads the files git would commit, without `.git` or `.apimatic/`, and a dry run previews the real SDK directory. Then (2026-10-27): `GitService` answers with `Result`s and the context composes them; the context split into `SnapshotStore`, `SdkFiles`, `ShareHookInstaller` and `GenerationRecordFile`, with `SdkPath` and the types in `repository-state.ts`; `execute` speaks every prompt itself again, with no other method on the action, and `SdkRepositoryContext.record` does the snapshot, the record and the hook in one step, answering with `RecordProblem`; a run left unresolved is reported once, whether it could not ask or settling did not clear every file. Last: dead code and duplicates gone (`emptyTree`, `TreeId.create`, `renames`, `unchanged`, `MergeOutcome.merged`, the hook block's version, the refspecs, `describe`, the `reset` fallback); one object-id rule (`OBJECT_ID`, 40 or 64 hex, so a SHA-256 repository works), one stage-entry parser and one `STAGE` map, one TTY check, one wording for the unresolved listing and the destination rule, the `other` conflict labelled by the CLI; the disk snapshot honours the repository's own ignore rules and reaches a sparse checkout with `--sparse`; a hook with no shebang is left alone; a path the generator renamed away is not brought back when its deletion is settled for the generator; the comments cut to a line of why; the tests moved where they belong, with the hook tests under an empty global git config. |
| 16 | this file | Product review (2026-10-29): `--git-init` replaces the create-repository question (`RunMode.gitInit`; `askToCreate`, `creating`, the `createRepository` prompt and its refusal gone), always on for `sdk publish` with flags and a flag in its step-by-step experience; only the SDK directory's own repository counts (`SdkContext.repository`; `GitService.isIgnored` gone); "Found a git repository" on the first run to record in one (`announceRepository`, `repositoryFound`); `--force` takes the generator's side on conflicts, this run's and the last run's (`onConflictFor`, `OnConflict` `generated`; `conflicts` and `mergeNeedsResolving` gone); resolving by hand succeeds, with steps that offer a merge tool and name the files with markers and without (`MergePlan.markedPaths` and `unmarkedPaths` replace `nextSteps`); "I'll finish resolving them" cancels; the conflict labels say what happened and nothing more; the warning about another generation is gone (`recordNotForThisGeneration`, `GenerationDifference`, `differenceFrom`, `describe`, `describeWithGenerator`, and the state's `recorded` with `GenerationRecord.generatedAs`). With one SDK directory per repository, what served one below a root went too: `SdkPath`, per-path and percent-encoded refs (`SnapshotRef` is the two fixed refs), the nested-SDK refusal (`NestedSdkDirectory`, `SnapshotStore.nested`, `GitService.listRefs`), `SdkRepositoryContext.create`, the sub-path branch of `GitService`'s tree snapshot and of `unmergedStages`, `RelativeFilePath.under`; the hook script pushes the one ref; the restore command runs `git -C` in the SDK directory. |
| 17 | this file | `--force` replaces a recorded SDK it cannot merge into, whose record names another generation or a missing snapshot, instead of refusing it, and warns after the write that the customizations were not carried over (`WriteMode` `record` `warnReplacedRecord`, `recordedSdkReplaced`; `recordedNotReplaced` and `recordedSdkNotReplaced` gone); the flag's help says so. |
| 18 | this file | The overwrite question counts hidden entries: the save keeps only `.git`, but the check skipped every name starting with a dot, so a first recording run in a repository of the developer's own that held only `.github` or `.husky` removed them without asking. `SdkContext.exists` asks `FileService.hasEntriesExcluding`, which pairs with `cleanDirectoryExcluding`; the other commands keep `directoryEmpty`. |

PR into `dev`, squash-merged, title `feat(sdk): keep your edits when regenerating an SDK`.

## 9. Files

| File | Role |
|---|---|
| `src/infrastructure/git-service.ts` | the system git behind every snapshot, the merge (its output read into stages and messages) and the index staging |
| `src/types/sdk-repository-context.ts` | the SDK directory with its repository: `inspect`, `regenerate` (the merge as a `Regeneration`), `write` (the previous ref, then the plan to disk), settling, the index; composed of the four below |
| `src/types/sdk-repository/{snapshot-store,sdk-files,share-hook-installer,generation-record-file,merge-engine}.ts` | the effectful parts of `SdkRepositoryContext`, one concept each: the refs and snapshots (fetched and joined), the files on disk (a plan landed, undone, a file settled), the pre-push hook, the record file, git's three-way merge; `on-disk.ts` turns a file failure into a `RepositoryProblem`, which a `GitProblem` already is |
| `src/types/sdk/repository-state.ts` | the repository's states and problems as types, with no context behind them. `src/types/sdk/` holds only data and pure functions, which ESLint enforces: no infrastructure, no `fs`, no store |
| `src/types/sdk/{merge-plan,conflict-markers,unresolved-file}.ts` | pure: `MergePlan` built from git's merge and diffs, `taking(side)`, conflict kinds, the choices, markers and their resolution for either side, and how an unresolved file is settled from its stages |
| `src/types/sdk/{sdk-destination,repository-facts,pristine-chain,write-mode,recording-notice,sdk-generation,settlement,file-content}.ts` | the functional core of the run: how it writes and why (`destinationFor`, all five variants), what the repository's facts mean and in what order (`classify`, `afterFetch`), how two pristine chains meet (`reconcile`), what a settled merge is — data and pure functions, no I/O |
| `src/types/sdk/{snapshot-ref,generation-record,share-hook}.ts`, `src/types/git/{commit-id,tree-id,git-version,merge-tree,tree-entry,git-problem,git-operation,git-directory}.ts`, `src/types/file/relativeFilePath.ts` | value objects, the hook script and block, git's output as types |
| `src/actions/sdk/generate.ts`, `src/prompts/sdk/generate.ts` | the run, its questions and its wording |
| `src/types/sdk-context.ts` | `destination(generation)` (what git and the repository say, as an `SdkDestination` or `unresolved`, finding the SDK directory's own repository itself), `initRepository()`, save keeps `.git`, `archive` for upload |
| `src/infrastructure/terminal.ts` | whether a question can be asked at all |
| `src/commands/sdk/generate.ts` | flags (`--git-init`, `--force`), the git requirement in the description, intro/outro |
| `test/…` | mirrors each file above |

## 10. Architecture

Where each piece of the custom-code work lives, by layer, and what calls what. Arrows are
calls (or writes, where labelled); the dashed subgraph is outside the CLI. This is the code,
not the developer's flow (that is section 4.2).

```mermaid
flowchart TB
  subgraph CMD["Command — src/commands/sdk/generate.ts"]
    C["SdkGenerate.run()<br/>flags → GenerateAction.execute → outro(result)"]
  end
  subgraph ACT["Actions — src/actions/sdk/"]
    G["GenerateAction.execute(project, sdk, request, run, packageSettings?) → ActionResult<br/>reads top to bottom and speaks every prompt itself, with no other method on the action<br/>validate (SdkGeneration.create) · SdkContext.destination; unresolved and onConflictFor(run) not refuse → unresolvedChoice (the generator's side under --force), settleUnresolved, destination again once<br/>noticeFor → destinationNotice · writeModeFor(destination, run, exists) → refuse | save | init | record | merge · overwriteSdk if the mode says so<br/>withDirPath: zip → generateSdk → unzip → one switch on the mode: save · init/record (initRepository?, save, repositoryInitialised | repositoryFound | recordedSdkReplaced, recordFresh, recorded(recordingNotice)) · merge (regenerate → onConflict: ask | generated | refuse → settle → write → record → sdkMerged; conflicts left → stageConflicts, conflictSteps)"]
  end
  subgraph PR["Prompts — src/prompts/sdk/ (wording; switches only on unions the core decided)"]
    GP["SdkGeneratePrompts (wording; destinationNotice, refused, recorded and the steps switch on core unions)<br/>gitUnavailable · overwriteSdk · snapshotMissing · directoryNotInspected<br/>conflictsUnresolved · unresolvedChoice · resolveLater · conflictsResolved · conflictsNotSettled<br/>sdkGenerated · repositoryInitialised · repositoryFound · repositoryNotCreated · recordedSdkReplaced · sdkMerged · conflictChoice · runCancelled<br/>conflictsNotAsked · conflictSteps · conflictsNotStaged · snapshotNotRecorded · customCodeFailed · sdkNotWritten<br/>shareHookNeedsOneStep · shareHookNotInstalled"]
  end
  subgraph TY["Types — src/types/"]
    SC["SdkContext<br/>exists · destination(generation) → SdkDestination | Unresolved · initRepository · save · archive · loadSdkInTempDirectory"]
    RC["SdkRepositoryContext (sdk-repository-context.ts)<br/>remote · inspect → SdkRepositoryState · regenerate → Regeneration{generated, merge} · merge → MergeOutcome · write(base, plan)<br/>record(generated, generation) → ShareHookInstall | RecordProblem · settleUnresolved(side, paths) · stageConflicts · filesToShare<br/>composed of: SnapshotStore (sdk-repository/snapshot-store.ts: refs, snapshotGenerated/Disk, recordPristine, savePrevious, fetch and join) · SdkFiles (sdk-repository/sdk-files.ts: apply with undo, contentOf, settle) · ShareHookInstaller (sdk-repository/share-hook-installer.ts) · GenerationRecordFile (sdk-repository/generation-record-file.ts) · MergeEngine (sdk-repository/merge-engine.ts)<br/>repository-state.ts: SdkRepositoryState · SdkRepositoryProblem · InspectionProblem · ShareHookInstall · MergeOutcome · Regeneration"]
    MP["MergePlan (sdk/merge-plan.ts)<br/>from(inputs) · writes/deletes/conflicts/renames/files · taking(side) → FileWrite.settle<br/>ConflictKind · ConflictSide · ConflictChoice · UnresolvedChoice"]
    CMK["conflict-markers.ts<br/>relabelMarkers · resolveMarkers(content, side) · settleMarkers · unresolved-file.ts: settledContent"]
    GR["GenerationRecord (sdk/generation-record.ts)<br/>generation.json: language, codegen, stability, pristine commit · describeApart"]
    SR["SnapshotRef (sdk/snapshot-ref.ts)<br/>refs/apimatic/pristine · refs/apimatic/previous"]
    SH["ShareHook (sdk/share-hook.ts)<br/>SHARE_HOOK_SCRIPT · SHARE_HOOK_CALL · SHARE_HOOK_BLOCK · installInto · calls"]
    SD["SdkDestination (sdk/sdk-destination.ts)<br/>overwrite{found} | record{repository?, because} | merge{repository, base} · Unresolved{repository, paths}<br/>destinationFor({git, repository?: {handle, state}}) · replacesDirectory"]
    ST["Settlement (sdk/settlement.ts)<br/>{regeneration, plan, settled?: {side, paths}}<br/>resolving(regeneration) · favouring(side, regeneration)"]
    GT["git/ · CommitId · TreeId · GitVersion · merge-tree (Change, StageEntry, MergeTreeOutput)"]
    RF["file/ · RelativeFilePath · FilePath · DirectoryPath"]
  end
  subgraph INF["Infrastructure — src/infrastructure/"]
    GS["GitService (git-service.ts), every method a Promise<Result> carrying git's own words<br/>version · topLevel · init · operationInProgress · filesToCommit · treeOf · commitTree · updateRef · resolveRef · hasCommit<br/>mergeTree · diffTrees · listTree · readBlobs · stageConflicts (update-index) · unmergedStages (ls-files -u) · unstage<br/>remoteOf · fetchRef (no prompts, 30 s) · hooksDirectory · hooksPathConfigured · hooksRunFrom"]
    FS["FileService"]
    TU["infrastructure/terminal.ts · terminal.isInteractive"]
  end
  subgraph OUT["Outside the CLI (dashed)"]
    HK[".git/hooks/apimatic-pre-push (sh) called from .git/hooks/pre-push or .husky/pre-push<br/>push refs/apimatic/pristine · on rejection fetch into refs/apimatic/remotes/‹remote›/pristine, join, push again"]
    RM[(remote<br/>refs/apimatic/pristine)]
  end
  C --> G
  G --> GP
  G --> SC
  SC --> RC
  G --> RC
  G --> SD
  G --> ST
  SC --> SD
  ST --> MP
  G --> TU
  RC --> GS
  RC --> FS
  RC --> MP
  RC --> CMK
  RC --> GR
  RC --> SR
  RC --> SH
  MP --> GT
  GS --> GT
  RC --> RF
  RC -- writes script + block --> HK
  HK -- git push --> RM
  GS -- fetchRef --> RM
  style OUT stroke-dasharray: 5 5
```

What each layer owns:

| Layer | Holds | Never does |
|---|---|---|
| Command | flags, intro/outro | git, files, questions, telemetry (none for now) |
| Actions | the imperative shell: `execute` with the order of the steps, every question and message spoken through `this.prompts` in it, and no other method on the action; a step used twice is a function outside the class that answers with data | wording, git commands, file I/O, data on the `ActionResult`, deciding what a state means, speaking through anything but its own prompts |
| Prompts | words and `select`/`confirm` for data they are handed; an exhaustive switch on a union the core decided (`DestinationNotice`, `WriteRefusal`, `RecordingNotice`) worded through tables | derive a fact or a policy, know git refs |
| Types | the functional core: what the facts mean (`classify`, `destinationFor`, `writeModeFor`, `onConflictFor`), how a settled merge is written (`settle`), what to tell the developer as data (`noticeFor`, `recordingNotice`, `markedPaths`); the SDK directory with its repository (`SdkRepositoryContext`), the plan, the record, refs, the hook text | print, call the API, ask |
| Infrastructure | `git` and the file system | know what a snapshot or a conflict means |
| Outside | the hook script in the developer's `.git/hooks`, the remote's refs | need the CLI to run |

## 11. Needs a decision

- **Deleted by you, changed by the generator.** Conflict (this plan) or remembered deletion
  as Speakeasy does. The conflict recurs on docs files that change with every version bump;
  the memory is silent.
- **`git init` is a flag.** Decided 2026-10-29 on the product review, replacing the question
  of 2026-10-27, which had replaced the silent init: `--git-init` makes the SDK directory a
  repository, and without it every run writes without one and warns. The silent init left a
  commit-less repository inside `sdk/<language>` that broke `git add .` once the project became
  a repository, and CI got a repository nobody asked for; the question could not be answered
  in CI at all.
- **`SdkContext.directory()`.** Removed on review (2026-10-27): `ProjectContext.sdkDirectory(language, destination)` is the one place a `--destination` becomes a path, for both SDK commands, and the action names the directory by what it was given, never by a second spelling.
- **The record merges as binary.** Decided 2026-10-23 after testing with two clones: both
  regenerated, so both changed `generatedAt`, and the second pull hit a text conflict in the
  record. `.apimatic/.gitattributes` sets `merge=binary`: git writes no markers, leaves the
  puller's record in place as valid JSON and lists it as both modified, so `git add` accepts
  it; either record names a snapshot a run can merge from. Under `git pull --rebase` the
  record left in place is the upstream one, equally valid. Weighed and set aside: `merge=union`
  (no conflict, but invalid JSON), a custom "keep ours" driver (silent, but it needs a
  `git config` line in every clone, and a clone without it falls back to markers). The
  fields that changed on every run, `generatedAt` and `cliVersion`, were dropped on review
  (2026-10-27): nothing read them, and a regeneration that changed nothing still showed the
  record as modified. `linguist-generated` collapses the record in GitHub's pull request diffs.
- **Unresolved conflicts are git's unmerged entries**, decided 2026-10-23 on review: the
  CLI asks the index (`ls-files -u` below the SDK directory) and nothing else, so a file
  counts as resolved exactly when `git add` has marked it so, as after any merge. A
  developer who discards the index (`git reset`, `git stash`) with markers still in the
  files has told git the files are resolved; the next merge then sees the marker lines as
  their edit and flags them again, so nothing is lost silently.
- **Packages must exclude `.apimatic/`.** No change needed, checked 2026-10-20: all three v4
  manifests are whitelists (`package.json` `files`, the `.csproj`'s explicit `Pack="true"`
  items, `[tool.poetry]` `packages`), and `npm pack`, `dotnet pack` and `python -m build` on
  projects with a planted `.apimatic/generation.json` packed none of it.
- **Portal downloads.** `portal generate` ships the server's SDK zips, so a portal's download
  never contains custom code. Zipping the merged SDK directory from disk is a follow-up.
- **Sharing by the CLI.** Decided 2026-10-21, reversing the earlier "no remote": the manual
  push and fetch was the step developers would forget and the one a clone could not do. The
  alternative weighed was a tracked `.apimatic/pristine/` copy (travels with every branch, but
  doubles the working tree and every diff); the remote push keeps the tree clean and makes the
  failure modes (no rights, no credential, offline) warnings with a manual fallback.
- **No `--offline` flag.** Decided 2026-10-21: the cases it guarded (a read-only remote, a
  policy against tool pushes, a dead network) are per-repository, not per-run, and every one
  of them is already a warning that does not fail the run. If an opt-out is ever needed, a git
  config read by `remoteOf` fits better than a flag.
- **The hook, not the CLI, pushes.** Decided 2026-10-22, replacing the push inside the CLI
  from the day before: a snapshot pushed by the CLI left the remote without it whenever the
  push failed or the remote was attached later, and nothing but another `sdk generate` would
  send it. Tying it to the developer's own push makes the snapshot and the record that names
  it arrive together. Weighed and dropped: a fetch refspec in the remote's config (the hook and
  the CLI fetch for themselves), writing into a `core.hooksPath` directory (husky wipes it),
  a fetch hook (git has none; `post-merge` fires only on pulls that merge, and a clone has no
  hooks yet).
- **Conflicts ask.** Decided 2026-10-22, reworded 2026-10-23 on review: the first run offers
  resolve by hand,
  resolve using generator changes or using my changes (hunk by hunk: each marked block is
  settled for the side as the file is written, which `merge-tree -X` would also do but only
  from git 2.43; never the whole file or SDK, since dropping what merged cleanly is more than
  asked), or cancel the run. The run after, while files are still unresolved, offers to
  finish resolving or to resolve what remains for either side; undo and cancel are not on it.
  `--force` answers for the generator on both questions (2026-10-29 on the product review,
  replacing markers as its default), so a forced run ends with an SDK that builds. No
  `--on-conflict` flag: nothing else was asked for.
- **No `--zip` flag.** Decided 2026-10-21: `sdk generate --zip` wrote the archive the server
  sent and nothing else, which custom code could never apply to, and nobody needs the CLI to
  zip a directory. Removed outright rather than hidden and deprecated. The server still delivers
  a zip, which the CLI unpacks into a temp directory; `portal generate --zip` is untouched.

## 12. Relation to other work

The codegen-v2 server-side plan (custom code as a git merge the server performs, with the
`.git` zipped up and down each run) is superseded by this one; the server's `/api/generate`
needs none of it, and the beta CLI never uploads a source tree. The v3 CLI flow
(`--track-changes`, `save-changes`, `merge-source-tree`) was removed from `dev` in #427 with
its `git-service.ts` and the isomorphic-git dependency; the file name returns here for the
system-git wrapper, and no library is added. Speakeasy's `persistentEdits` has the same shape
(snapshots as hidden refs in the developer's repository, per-file three-way merge on the
working tree, markers plus a failed exit on conflict), with the four gaps the lab found
closed: moves, generator renames, add/add, and dropped edited files.
