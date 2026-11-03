import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { GitService } from '../infrastructure/git-service.js';
import { canonical } from '../infrastructure/tmp-extensions.js';
import { errorMessage } from '../utils/error-utils.js';
import { ValueMap, ValueSet } from './common/value-map.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { RelativePaths } from './file/relative-paths.js';
import { RelativeDirectoryPath } from './file/relativeDirectoryPath.js';
import { RelativeFilePath } from './file/relativeFilePath.js';
import { CommitId } from './git/commit-id.js';
import { GitVersion } from './git/git-version.js';
import { SIDE_STAGE, STAGE, StageEntry } from './git/merge-tree.js';
import { TreeEntry } from './git/tree-entry.js';
import { TreeId } from './git/tree-id.js';
import { Side } from './sdk/conflict-markers.js';
import { lineEndingFor } from './sdk/file-content.js';
import { Language, Stability } from './sdk/generate.js';
import { GenerationRecord, recordContents } from './sdk/generation-record.js';
import { MergePlan } from './sdk/merge-plan.js';
import { RecordedSnapshot } from './sdk/recorded-snapshot.js';
import { RepositoryState } from './sdk/repository-state.js';
import { ShareHook } from './sdk/share-hook.js';
import { SnapshotFetch } from './sdk/snapshot-fetch.js';
import { UnresolvedFile } from './sdk/unresolved-file.js';
import { WriteProblem } from './sdk/write-problem.js';
import { TempContext } from './temp-context.js';

/** The ref holding each generation as the server returned it, chained, off every branch of the SDK directory's own repository. */
const PRISTINE_REF = 'refs/apimatic/pristine';

/** The ref holding the directory as it was before the last merge wrote, byte for byte, so that write can be undone; named to the developer when the CLI could not undo it. */
export const PREVIOUS_REF = 'refs/apimatic/previous';

/** The sign that git has a say in the directory, a folder or a worktree's file, and the one entry a save keeps. */
const GIT_DIRECTORY = new FileName('.git');

/** Where the CLI keeps its record inside the SDK directory, and the file holding it. */
const RECORD_DIRECTORY = '.apimatic';
const RECORD_FILE = new FileName('generation.json');

// An upload holds the SDK as git would commit it, and the record is the CLI's.
const KEPT_OUT_OF_UPLOAD = [GIT_DIRECTORY.toString(), RECORD_DIRECTORY].map(
  (name) => RelativeDirectoryPath.fromGit(name)!
);

/** The attributes beside the record: a pull that meets a teammate's record keeps yours whole, with no markers in it, and GitHub folds it as generated. */
const RECORD_ATTRIBUTES_FILE = new FileName('.gitattributes');
const RECORD_ATTRIBUTES = `# Written by the APIMatic CLI.\n${RECORD_FILE.toString()} merge=binary linguist-generated=true\n`;

/**
 * The script the `pre-push` hook calls, for the remote git passes as `$1`: pushes the pristine ref;
 * when the remote's chain moved on, fetches it to a tracking ref, joins the two and pushes again; a
 * second failure is one line in the server's words, and the push never fails; a push carrying the
 * ref itself is left to itself. Joined line by line, never a template literal: a CRLF checkout
 * would put CR into it, which sh cannot read.
 */
const SHARE_HOOK_SCRIPT = [
  '#!/bin/sh',
  `# Shares the SDK snapshots (${PRISTINE_REF}) with the remote on every push, so a clone`,
  '# can merge its customizations. Written by the APIMatic CLI; the pre-push hook calls it.',
  'remote="$1"',
  `ref=${PRISTINE_REF}`,
  'tracking="refs/apimatic/remotes/$remote/pristine"',
  '# A push carrying the ref itself needs no help; the hook hands this script a copy of what git lists on stdin.',
  'while read -r local_ref local_sha remote_ref remote_sha; do',
  '  [ "$remote_ref" = "$ref" ] && exit 0',
  'done',
  'git rev-parse -q --verify "$ref^{commit}" >/dev/null 2>&1 || exit 0',
  'GIT_TERMINAL_PROMPT=0 git push --quiet --no-verify "$remote" "$ref:$ref" >/dev/null 2>&1 && exit 0',
  'GIT_TERMINAL_PROMPT=0 git fetch --quiet --no-tags "$remote" "+$ref:$tracking" >/dev/null 2>&1 || true',
  'if git rev-parse -q --verify "$tracking^{commit}" >/dev/null 2>&1; then',
  '  if git merge-base --is-ancestor "$ref" "$tracking"; then',
  '    git update-ref "$ref" "$tracking"',
  '  elif ! git merge-base --is-ancestor "$tracking" "$ref"; then',
  "    joined=$(git -c user.name='APIMatic CLI' -c user.email=developer@apimatic.io \\",
  '      commit-tree "$ref^{tree}" -p "$ref" -p "$tracking" -m \'apimatic: pristine chains joined\')',
  '    git update-ref "$ref" "$joined"',
  '  fi',
  'fi',
  'said=$(GIT_TERMINAL_PROMPT=0 git push --quiet --no-verify "$remote" "$ref:$ref" 2>&1 >/dev/null) && exit 0',
  "reason=$(printf '%s\\n' \"$said\" | grep -m1 '^remote:' | sed 's/^remote: *//')",
  '[ -z "$reason" ] && reason=$(printf \'%s\\n\' "$said" | grep -m1 .)',
  'echo "apimatic: the SDK snapshots could not be pushed to $remote: $reason" >&2',
  'exit 0',
  ''
].join('\n');

/**
 * The SDK directory under git: what the disk and git say about it, what its remote holds, what a run
 * plans for it, how a plan lands on it, and the snapshots it keeps. Every plan carries the bytes that
 * reach the disk, line endings decided, so landing one is the same whatever made it.
 */
export class GitContext {
  private readonly gitService = new GitService();
  private readonly fileService = new FileService();

  constructor(private readonly directory: DirectoryPath) {}

  // --- What the disk and git say ---------------------------------------------------------------

  /** Whether the directory has a `.git` of its own, read from disk so no git is needed to know whether git will be. */
  public async hasGitDirectory(): Promise<boolean> {
    return hasOwnGit(this.fileService, this.directory);
  }

  /** Whether a save would remove anything: hidden entries such as `.github` count, only `.git` stays. */
  public async hasFilesBesidesGit(): Promise<boolean> {
    return this.fileService.hasEntriesExcluding(this.directory, [GIT_DIRECTORY]);
  }

  /**
   * Whether the directory is a repository as `git` sees it: the root of its own, not inside one that
   * only encloses it, which is the developer's. False, with no git run, without a `.git` of its own
   * or a git that can serve the merge, so a directory that is not there yet is fine.
   */
  public async isRepository(git: GitVersion): Promise<Result<boolean, string>> {
    if (!git.isSupported()) {
      return ok(false);
    }
    return isRootOfRepository(this.fileService, this.gitService, this.directory);
  }

  /** The record the last recording left; none without a file, or with one a CLI did not write. */
  public async generationRecord(): Promise<GenerationRecord> {
    const file = recordFile(this.directory);
    if (!(await this.fileService.fileExists(file))) {
      return GenerationRecord.none();
    }
    return GenerationRecord.parse(await this.fileService.getContents(file));
  }

  /**
   * What git says about the directory for a generation, read once and in order: whether it is a
   * repository of its own as `git` sees it, the operation it is in the middle of, the paths it holds
   * as unmerged, and the snapshot the record names for `language` at `stability`, with whether it is
   * here. A directory that is not a repository answers with nothing, running no git past the root.
   */
  public async inspect(
    git: GitVersion,
    language: Language,
    stability: Stability
  ): Promise<Result<RepositoryState, string>> {
    const isRepository = await this.isRepository(git);
    if (isRepository.isErr()) {
      return err(isRepository.error);
    }
    if (!isRepository.value) {
      return ok(RepositoryState.notARepository());
    }
    const operation = await this.gitService.operationInProgress(this.directory);
    if (operation.isErr()) {
      return err(operation.error);
    }
    const unmerged = await this.gitService.unmergedStages(this.directory);
    if (unmerged.isErr()) {
      return err(unmerged.error);
    }
    const record = await this.generationRecord();
    const base = record.baseFor(language, stability);
    const baseHeld = base === undefined ? ok(false) : await this.gitService.hasCommit(this.directory, base);
    if (baseHeld.isErr()) {
      return err(baseHeld.error);
    }
    const unresolved = new ValueSet(unmerged.value.map((entry) => entry.path)).values();
    return ok(RepositoryState.of(operation.value, unresolved, record.isFound(), base, baseHeld.value));
  }

  // --- What the remote holds ---------------------------------------------------------------------

  /**
   * The snapshot fetched when the repository lacks it and has a remote, the branch's else `origin`:
   * the remote's pristine chain is brought over and met with the local one, so neither machine's
   * generations are lost. As it is when it is held, or nothing is recorded. A remote that lacks it or
   * does not answer is part of the answer, and so is a git here that fails once the remote has
   * answered; only one that fails before the remote is asked fails the run.
   */
  public async fetchSnapshot(snapshot: RecordedSnapshot): Promise<Result<RecordedSnapshot, string>> {
    const wanted = snapshot.toFetch();
    if (wanted === undefined) {
      return ok(snapshot);
    }
    const remote = await this.gitService.remoteOf(this.directory);
    if (remote.isErr()) {
      return err(remote.error);
    }
    if (remote.value === undefined) {
      return ok(snapshot.stillMissing(SnapshotFetch.none()));
    }
    const tip = await this.gitService.fetchRef(this.directory, remote.value, PRISTINE_REF);
    if (tip.isErr()) {
      return ok(snapshot.stillMissing(SnapshotFetch.failed(remote.value, tip.error)));
    }
    if (tip.value === undefined) {
      return ok(snapshot.stillMissing(SnapshotFetch.absent(remote.value)));
    }
    // Past the fetch, a git here that does not answer is a fetch that failed: this generation starts afresh, as when the remote lacks the snapshot.
    const met = await meetChains(this.gitService, this.directory, tip.value);
    if (met.isErr()) {
      return ok(snapshot.stillMissing(SnapshotFetch.failed(remote.value, met.error)));
    }
    const held = await this.gitService.hasCommit(this.directory, wanted);
    if (held.isErr()) {
      return ok(snapshot.stillMissing(SnapshotFetch.failed(remote.value, held.error)));
    }
    return ok(held.value ? snapshot.brought() : snapshot.stillMissing(SnapshotFetch.absent(remote.value)));
  }

  // --- What a run plans --------------------------------------------------------------------------

  /**
   * The fresh generation at `generated` merged over the directory as it is, against `base`, by git:
   * what to write, each file with the bytes that reach the disk, and remove, what conflicts, and what
   * happened to every other file. Nothing is written.
   */
  public async merge(base: CommitId, generated: DirectoryPath): Promise<Result<MergePlan, string>> {
    const generatedTree = await this.gitService.treeOf(this.directory, generated);
    if (generatedTree.isErr()) {
      return err(generatedTree.error);
    }
    const baseTree = await this.gitService.treeOfCommit(this.directory, base);
    if (baseTree.isErr()) {
      return err(baseTree.error);
    }
    const baseEntries = await this.gitService.listTree(this.directory, baseTree.value);
    if (baseEntries.isErr()) {
      return err(baseEntries.error);
    }
    // Every path the base holds goes in, so a generated file an ignore rule matches is never taken for deleted.
    const basePaths = baseEntries.value.map((entry) => entry.path);
    const disk = await this.gitService.treeOfDirectory(this.directory, basePaths);
    if (disk.isErr()) {
      return err(disk.error);
    }
    const yours = await this.gitService.commitTree(this.directory, disk.value, [base], 'apimatic: your changes');
    if (yours.isErr()) {
      return err(yours.error);
    }
    const theirs = await this.gitService.commitTree(this.directory, generatedTree.value, [base], 'apimatic: generated');
    if (theirs.isErr()) {
      return err(theirs.error);
    }
    const merged = await this.gitService.mergeTree(this.directory, yours.value, theirs.value);
    if (merged.isErr()) {
      return err(merged.error);
    }
    const generatorStages = merged.value.stages.filter((entry) => entry.stage === SIDE_STAGE.generated);
    const generatedVersions = await this.gitService.readBlobs(
      this.directory,
      generatorStages.map((entry) => entry.oid)
    );
    if (generatedVersions.isErr()) {
      return err(generatedVersions.error);
    }
    const yourChanges = await this.gitService.diffTreesPairingRenames(this.directory, baseTree.value, disk.value);
    if (yourChanges.isErr()) {
      return err(yourChanges.error);
    }
    const generatedChanges = await this.gitService.diffTreesPairingRenames(
      this.directory,
      baseTree.value,
      generatedTree.value
    );
    if (generatedChanges.isErr()) {
      return err(generatedChanges.error);
    }
    const applied = await this.gitService.diffTrees(this.directory, disk.value, merged.value.tree);
    if (applied.isErr()) {
      return err(applied.error);
    }
    const changed = applied.value.flatMap((change) => (change.status === 'D' ? [] : [change]));
    const contents = await this.gitService.readBlobs(
      this.directory,
      changed.map((change) => change.blob)
    );
    if (contents.isErr()) {
      return err(contents.error);
    }
    try {
      // Each file ends its lines as it does on disk, else as the generator's own does.
      const writes = await Promise.all(
        changed.map(async (change, index) => ({
          path: change.path,
          content: await ending(
            this.fileService,
            contents.value[index],
            change.path.in(this.directory),
            change.path.in(generated)
          )
        }))
      );
      const versions = await Promise.all(
        generatorStages.map(
          async (entry, index): Promise<[RelativeFilePath, Uint8Array]> => [
            entry.path,
            await ending(this.fileService, generatedVersions.value[index], entry.path.in(generated))
          ]
        )
      );
      return ok(
        MergePlan.from({
          merge: merged.value,
          // The CLI's own record, and the attributes beside it, are not edits of yours.
          yours: yourChanges.value.filter((change) => !change.path.toString().startsWith(`${RECORD_DIRECTORY}/`)),
          generated: generatedChanges.value,
          writes,
          deletes: applied.value.flatMap((change) => (change.status === 'D' ? [change.path] : [])),
          basePaths,
          generatedVersions: new ValueMap(versions)
        })
      );
    } catch (error) {
      return err(errorMessage(error));
    }
  }

  /**
   * The last run's unresolved `paths` settled for `side`, as a plan: from the disk and the two sides
   * git kept in the index, markers settled in place and whole files taken as the side says, each
   * with the line ending the disk has. Nothing is written.
   */
  public async settlementFor(side: Side, paths: readonly RelativeFilePath[]): Promise<Result<MergePlan, string>> {
    const stages = await this.gitService.unmergedStages(this.directory);
    if (stages.isErr()) {
      return err(stages.error);
    }
    const kept = stages.value.filter((entry) => entry.stage !== STAGE.base);
    const contents = await this.gitService.readBlobs(
      this.directory,
      kept.map((entry) => entry.oid)
    );
    if (contents.isErr()) {
      return err(contents.error);
    }
    const yours = versionsAt(kept, contents.value, SIDE_STAGE.yours);
    const generated = versionsAt(kept, contents.value, SIDE_STAGE.generated);
    try {
      const settlements = await Promise.all(
        paths.map(async (path) => {
          const disk = await firstOf(this.fileService, path.in(this.directory));
          const version = generated.get(path);
          const theirs = version === undefined ? undefined : lineEndingFor(version, disk);
          return new UnresolvedFile(path, disk, yours.get(path), theirs).settledFor(side);
        })
      );
      return ok(MergePlan.empty().settled(settlements));
    } catch (error) {
      return err(errorMessage(error));
    }
  }

  // --- How a plan lands --------------------------------------------------------------------------

  /** Replaces whatever the directory holds with the generated SDK, except its `.git`. */
  public async save(generated: DirectoryPath): Promise<DirectoryPath> {
    await this.fileService.cleanDirectoryExcluding(this.directory, [GIT_DIRECTORY]);
    await this.fileService.copyDirectoryContents(generated, this.directory);
    return this.directory;
  }

  /**
   * The directory zipped for upload into `tempDirectory`, holding what git would commit: not `.git`,
   * not the CLI's record and, in a repository of its own, not what its ignore rules keep out, such as
   * `node_modules`. Any git that is found reads the rules, one too old to merge included; without
   * one, or outside a repository of its own, git is not asked: every file but those two.
   */
  public async archiveForUpload(git: GitVersion, tempDirectory: DirectoryPath): Promise<Result<FilePath, string>> {
    const isRepository = git.isFound()
      ? await isRootOfRepository(this.fileService, this.gitService, this.directory)
      : ok(false);
    if (isRepository.isErr()) {
      return err(isRepository.error);
    }
    const keptOut = await keptOutOfUpload(this.gitService, this.directory, isRepository.value);
    if (keptOut.isErr()) {
      return err(keptOut.error);
    }
    const archive = await new TempContext(tempDirectory).zip(this.directory, keptOut.value);
    return archive.mapErr((problem) => problem.reason);
  }

  /**
   * Keeps the directory as it is, byte for byte, under the previous ref, replacing what the last run
   * kept, so a write can be undone; every path `base` holds goes in, ignore rules or not.
   */
  public async keepPrevious(base: CommitId): Promise<Result<CommitId, string>> {
    const baseEntries = await this.gitService.listTree(this.directory, base);
    if (baseEntries.isErr()) {
      return err(baseEntries.error);
    }
    const disk = await this.gitService.treeOfDirectoryAsIs(
      this.directory,
      baseEntries.value.map((entry) => entry.path)
    );
    if (disk.isErr()) {
      return err(disk.error);
    }
    const commit = await this.gitService.commitTree(this.directory, disk.value, [], 'apimatic: before regeneration');
    if (commit.isErr()) {
      return err(commit.error);
    }
    const moved = await this.gitService.updateRef(this.directory, PREVIOUS_REF, commit.value);
    return moved.map(() => commit.value);
  }

  /**
   * Lands the plan: removals before writes, so a name that changed only in case lands on a
   * filesystem that ignores case, and each file only when its bytes differ. A step that fails is
   * named and nothing is undone, so the caller can put the directory back from the snapshot it kept.
   */
  public async write(plan: MergePlan): Promise<Result<void, WriteProblem>> {
    for (const path of plan.deletes) {
      try {
        await removeFile(this.fileService, path.in(this.directory), this.directory);
      } catch (error) {
        return err({ file: path, operation: 'remove', reason: errorMessage(error) });
      }
    }
    for (const write of plan.writes) {
      try {
        await this.fileService.writeBytesIfChanged(write.path.in(this.directory), write.content);
      } catch (error) {
        return err({ file: write.path, operation: 'write', reason: errorMessage(error) });
      }
    }
    return ok(undefined);
  }

  /**
   * Puts every path the plan names back as `previous` holds it, in the plan's order, removing first
   * what it does not hold so a name that changed only in case comes back on a filesystem that
   * ignores case. A path the write had not reached is already as it was, so the undo need not know how far it got.
   */
  public async restore(previous: CommitId, plan: MergePlan): Promise<Result<void, string>> {
    const entries = await this.gitService.listTree(this.directory, previous);
    if (entries.isErr()) {
      return err(entries.error);
    }
    const kept = new ValueMap(entries.value.map((entry): [RelativeFilePath, TreeEntry] => [entry.path, entry]));
    const named = [...plan.deletes, ...plan.writes.map((write) => write.path)];
    const held = named.flatMap((path) => kept.get(path) ?? []);
    const contents = await this.gitService.readBlobs(
      this.directory,
      held.map((entry) => entry.oid)
    );
    if (contents.isErr()) {
      return err(contents.error);
    }
    try {
      for (const path of named.filter((path) => !kept.has(path))) {
        await removeFile(this.fileService, path.in(this.directory), this.directory);
      }
      for (const [index, entry] of held.entries()) {
        await this.fileService.writeBytesIfChanged(entry.path.in(this.directory), contents.value[index]);
      }
      return ok(undefined);
    } catch (error) {
      return err(errorMessage(error));
    }
  }

  // --- The snapshots it keeps --------------------------------------------------------------------

  /**
   * Commits every file of `generated` under the pristine ref, chained onto the last snapshot, and
   * writes the record naming it, with the attributes beside it, so the next run for the same
   * generation has this one as its base. An identical generation keeps the last snapshot.
   */
  public async recordSnapshot(
    generated: DirectoryPath,
    language: Language,
    stability: Stability
  ): Promise<Result<CommitId, string>> {
    const tree = await this.gitService.treeOf(this.directory, generated);
    if (tree.isErr()) {
      return err(tree.error);
    }
    const last = await this.gitService.resolveRef(this.directory, PRISTINE_REF);
    if (last.isErr()) {
      return err(last.error);
    }
    const snapshot = await snapshotOf(
      this.gitService,
      this.directory,
      tree.value,
      last.value,
      `apimatic: pristine ${language} ${stability}`
    );
    if (snapshot.isErr()) {
      return err(snapshot.error);
    }
    try {
      await this.fileService.replaceContentsIfChanged(
        new FilePath(this.directory.join(RECORD_DIRECTORY), RECORD_ATTRIBUTES_FILE),
        RECORD_ATTRIBUTES
      );
      await this.fileService.replaceContentsIfChanged(
        recordFile(this.directory),
        recordContents(language, stability, snapshot.value)
      );
      return ok(snapshot.value);
    } catch (error) {
      return err(errorMessage(error));
    }
  }

  // --- How the snapshots are shared --------------------------------------------------------------

  /**
   * Makes every `git push` share the snapshots: the script goes into git's own hooks directory and
   * the `pre-push` hook git runs is made to call it, as `ShareHook` decides from what is there; a
   * hook git runs from elsewhere, or in another language, is left alone and the line to add named.
   * Nothing here stops a run: a hook that could not be written is part of the answer.
   */
  public async shareOnPush(): Promise<ShareHook> {
    const own = await this.gitService.hooksDirectory(this.directory);
    if (own.isErr()) {
      return ShareHook.notWritten(own.error);
    }
    const runFrom = await this.gitService.hooksRunFrom(this.directory);
    if (runFrom.isErr()) {
      return ShareHook.notWritten(runFrom.error);
    }
    const file = ShareHook.fileIn(runFrom.value);
    try {
      // The script is kept whatever runs the hooks, so a hook elsewhere has it to call.
      await writeExecutable(this.fileService, ShareHook.scriptIn(own.value), SHARE_HOOK_SCRIPT);
      const existing = (await this.fileService.fileExists(file)) ? await this.fileService.getContents(file) : '';
      const hook = ShareHook.found({ existing, own: own.value, runFrom: runFrom.value, repository: this.directory });
      const content = hook.toWrite();
      if (content !== undefined) {
        await writeExecutable(this.fileService, file, content);
      }
      return hook;
    } catch (error) {
      return ShareHook.notWritten(errorMessage(error));
    }
  }
}

function recordFile(directory: DirectoryPath): FilePath {
  return new FilePath(directory.join(RECORD_DIRECTORY), RECORD_FILE);
}

/** The bytes of the first of `candidates` that is there; none when none is. */
async function firstOf(files: FileService, ...candidates: FilePath[]): Promise<Uint8Array | undefined> {
  for (const file of candidates) {
    if (await files.fileExists(file)) {
      return files.getBytes(file);
    }
  }
  return undefined;
}

/** `content` ending its lines as the first of `samples` on disk does; as it is when none is there. */
async function ending(files: FileService, content: Uint8Array, ...samples: FilePath[]): Promise<Uint8Array> {
  return lineEndingFor(content, await firstOf(files, ...samples));
}

/** Removes the file and the directories that leaves empty, below `within`. */
async function removeFile(files: FileService, file: FilePath, within: DirectoryPath): Promise<void> {
  await files.deleteFile(file);
  await files.removeEmptyDirectories(file.directory(), within);
}

/** Writes the file when its content changed, executable as git needs a hook to be. */
async function writeExecutable(files: FileService, file: FilePath, content: string): Promise<void> {
  if (await files.replaceContentsIfChanged(file, content)) {
    await files.makeExecutable(file);
  }
}

/** Whether `directory` has a `.git` of its own, a folder or a worktree's file, read from disk so no git is needed to know whether git will be. */
async function hasOwnGit(files: FileService, directory: DirectoryPath): Promise<boolean> {
  return (
    (await files.directoryExists(directory.join(GIT_DIRECTORY.toString()))) ||
    (await files.fileExists(new FilePath(directory, GIT_DIRECTORY)))
  );
}

/** Whether git says `directory` is the root of its own repository; false, with no git run, without a `.git` of its own. */
async function isRootOfRepository(
  files: FileService,
  git: GitService,
  directory: DirectoryPath
): Promise<Result<boolean, string>> {
  if (!(await hasOwnGit(files, directory))) {
    return ok(false);
  }
  // Spelt as git spells the root, so an 8.3 alias on Windows still compares equal.
  const real = new DirectoryPath(canonical(directory.toString()));
  const root = await git.topLevel(real);
  return root.map((found) => found !== undefined && found.isEqual(real));
}

/** What the upload leaves out: the two the CLI names and, in a repository of its own, what git's ignore rules keep out. */
async function keptOutOfUpload(
  git: GitService,
  directory: DirectoryPath,
  ownRepository: boolean
): Promise<Result<RelativePaths, string>> {
  if (!ownRepository) {
    return ok({ files: [], directories: KEPT_OUT_OF_UPLOAD });
  }
  const ignored = await git.ignoredBelow(directory);
  return ignored.map(({ files, directories }) => ({ files, directories: [...KEPT_OUT_OF_UPLOAD, ...directories] }));
}

/** Each path's content at `stage`, from the entries git holds as unmerged and their blobs, read in the same order. */
function versionsAt(
  entries: readonly StageEntry[],
  contents: readonly Uint8Array[],
  stage: StageEntry['stage']
): ValueMap<RelativeFilePath, Uint8Array> {
  return new ValueMap(
    entries.flatMap((entry, index) => (entry.stage === stage ? [[entry.path, contents[index]] as const] : []))
  );
}

/** `last` when it already holds `tree`, else a commit of `tree` on `last` with `message`, which the pristine ref is moved to. */
async function snapshotOf(
  git: GitService,
  root: DirectoryPath,
  tree: TreeId,
  last: CommitId | undefined,
  message: string
): Promise<Result<CommitId, string>> {
  if (last !== undefined) {
    const lastTree = await git.treeOfCommit(root, last);
    if (lastTree.isErr()) {
      return err(lastTree.error);
    }
    if (lastTree.value.isEqual(tree)) {
      return ok(last);
    }
  }
  const commit = await git.commitTree(root, tree, last === undefined ? [] : [last], message);
  if (commit.isErr()) {
    return err(commit.error);
  }
  return (await git.updateRef(root, PRISTINE_REF, commit.value)).map(() => commit.value);
}

/**
 * The remote's pristine chain at `tip` met with the local one, so neither machine's generations are
 * lost: the ref adopts the tip when there is no chain here or the remote's continues it, keeps its own
 * when the remote's is behind, and moves to a two-parent commit over its own tree when the two diverged.
 */
async function meetChains(git: GitService, root: DirectoryPath, tip: CommitId): Promise<Result<void, string>> {
  const local = await git.resolveRef(root, PRISTINE_REF);
  if (local.isErr()) {
    return err(local.error);
  }
  if (local.value === undefined) {
    return git.updateRef(root, PRISTINE_REF, tip);
  }
  const continued = await git.isAncestor(root, local.value, tip);
  if (continued.isErr()) {
    return err(continued.error);
  }
  const behind = await git.isAncestor(root, tip, local.value);
  if (behind.isErr()) {
    return err(behind.error);
  }
  if (continued.value) {
    return git.updateRef(root, PRISTINE_REF, tip);
  }
  if (behind.value) {
    return ok(undefined);
  }
  const tree = await git.treeOfCommit(root, local.value);
  if (tree.isErr()) {
    return err(tree.error);
  }
  const joined = await git.commitTree(root, tree.value, [local.value, tip], 'apimatic: pristine chains joined');
  if (joined.isErr()) {
    return err(joined.error);
  }
  return git.updateRef(root, PRISTINE_REF, joined.value);
}
