import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { err, Err, ok, Result, ResultAsync, safeTry } from 'neverthrow';
import { FileService } from '../../infrastructure/file-service.js';
import { GitService } from '../../infrastructure/git-service.js';
import { DirectoryPath } from '../file/directoryPath.js';
import { FilePath } from '../file/filePath.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';
import { CommitId } from '../git/commit-id.js';
import { relabelMarkers, settleMarkers } from './conflict-markers.js';
import { FileWrite, MergePlan } from './merge-plan.js';
import { gitFailed, NotApplied, onDisk, SdkRepositoryProblem } from './repository-state.js';
import { SnapshotRef } from './snapshot-ref.js';

type Steps<T> = AsyncGenerator<Err<never, SdkRepositoryProblem>, Result<T, SdkRepositoryProblem>>;

/**
 * The files on disk below an SDK directory: a merge plan landed on them, put back from a
 * snapshot when that fails partway, and one file read or settled. Trees hold LF, so a blob
 * is written with the line ending the file there uses, else the generator's fresh copy of it,
 * else LF; a blob with a CR of its own, or binary, is written as it is.
 */
export class SdkFiles {
  private readonly fileService = new FileService();
  private readonly git = new GitService();

  constructor(private readonly root: DirectoryPath, private readonly sdk: DirectoryPath) {}

  /**
   * Applies the plan, removals before writes so a path renamed only in case lands on a
   * filesystem that ignores case. A write or removal that fails ends the run and puts back,
   * from `previous`, every path it had changed, so the directory is as it was.
   */
  public apply(
    plan: MergePlan,
    previous: { commit: CommitId; ref: SnapshotRef },
    generated: DirectoryPath
  ): ResultAsync<void, SdkRepositoryProblem> {
    return this.git
      .readBlobs(this.root, [...new Set(plan.writes.map((write) => write.blob))])
      .mapErr(gitFailed)
      .andThen((blobs) => new ResultAsync(this.applying(plan, previous, generated, blobs)));
  }

  private async applying(
    plan: MergePlan,
    previous: { commit: CommitId; ref: SnapshotRef },
    generated: DirectoryPath,
    blobs: Map<string, Uint8Array>
  ): Promise<Result<void, SdkRepositoryProblem>> {
    const steps: { path: RelativeFilePath; operation: NotApplied['operation']; run: () => Promise<void> }[] = [
      ...plan.deletes.map((path) => ({
        path,
        operation: 'remove' as const,
        run: () => this.remove(path.in(this.sdk))
      })),
      ...plan.writes.map((write) => ({
        path: write.path,
        operation: 'write' as const,
        run: async () => {
          const content = markersOf(plan, write, blobs.get(write.blob)!);
          const file = write.path.in(this.sdk);
          return this.put(file, await this.withLineEnding(content, file, write.path.in(generated)));
        }
      }))
    ];
    const touched: RelativeFilePath[] = [];
    for (const step of steps) {
      touched.push(step.path);
      // Each step is its own attempt: the one that fails is named, and the ones before it are undone.
      const done = await onDisk(step.run());
      if (done.isErr()) {
        return err({
          kind: 'notApplied',
          file: step.path.in(this.sdk),
          operation: step.operation,
          reason: done.error.reason,
          undo: await this.undo(previous, touched)
        });
      }
    }
    return ok(undefined);
  }

  private async undo(
    previous: { commit: CommitId; ref: SnapshotRef },
    touched: readonly RelativeFilePath[]
  ): Promise<NotApplied['undo']> {
    const restored = await safeTry(this.restoring.bind(this, previous.commit, touched));
    return restored.match(
      () => ({ kind: 'done' }),
      (problem) => ({ kind: 'failed', reason: problem.reason, previous: previous.ref })
    );
  }

  private async *restoring(previous: CommitId, touched: readonly RelativeFilePath[]): Steps<void> {
    const kept = new Map(
      (yield* this.git.listTree(this.root, previous).mapErr(gitFailed)).map((entry) => [
        entry.path.toString(),
        entry.oid
      ])
    );
    const oids = touched.flatMap((relative) => kept.get(relative.toString()) ?? []);
    const blobs = yield* this.git.readBlobs(this.root, [...new Set(oids)]).mapErr(gitFailed);
    for (const relative of touched) {
      const oid = kept.get(relative.toString());
      yield* onDisk(
        oid === undefined ? this.remove(relative.in(this.sdk)) : this.put(relative.in(this.sdk), blobs.get(oid)!)
      );
    }
    return ok(undefined);
  }

  /** The file as it is, or none when it is not there. */
  public contentOf(relative: RelativeFilePath): ResultAsync<Uint8Array | undefined, SdkRepositoryProblem> {
    const file = relative.in(this.sdk);
    return onDisk(
      (async () =>
        (await this.fileService.fileExists(file))
          ? new Uint8Array(await fs.promises.readFile(file.toString()))
          : undefined)()
    );
  }

  /** Writes the file with its own line ending, or removes it when there is nothing to settle it to. */
  public settle(relative: RelativeFilePath, content: Uint8Array | undefined): ResultAsync<void, SdkRepositoryProblem> {
    const file = relative.in(this.sdk);
    return onDisk(
      content === undefined
        ? fs.promises.rm(file.toString(), { force: true })
        : this.withLineEnding(content, file).then((bytes) => this.put(file, bytes))
    );
  }

  private async withLineEnding(content: Uint8Array, file: FilePath, ...samples: FilePath[]): Promise<Uint8Array> {
    if (content.includes(0x0d) || content.subarray(0, 8000).includes(0)) {
      return content;
    }
    for (const sample of [file, ...samples]) {
      if (await this.fileService.fileExists(sample)) {
        const crlf = (await fs.promises.readFile(sample.toString())).includes('\r\n');
        const text = Buffer.from(content).toString('latin1');
        return crlf ? new Uint8Array(Buffer.from(text.replace(/\n/g, '\r\n'), 'latin1')) : content;
      }
    }
    return content;
  }

  private async put(file: FilePath, content: Uint8Array): Promise<void> {
    const target = file.toString();
    if ((await this.fileService.fileExists(file)) && (await fs.promises.readFile(target)).equals(content)) {
      return;
    }
    await fs.promises.mkdir(file.directory().toString(), { recursive: true });
    await fs.promises.writeFile(target, content);
  }

  private async remove(file: FilePath): Promise<void> {
    await fs.promises.rm(file.toString(), { force: true });
    for (let directory = file.directory(); this.sdk.isAncestorOf(directory); directory = directory.join('..')) {
      try {
        await fs.promises.rmdir(directory.toString());
      } catch {
        return;
      }
    }
  }
}

/** A marked file settled for the side the plan chose, else git's labels replaced by the CLI's, else the bytes as they are. */
function markersOf(plan: MergePlan, write: FileWrite, content: Uint8Array): Uint8Array {
  if (write.settle !== undefined) {
    const labelled = relabelMarkers(content);
    return settleMarkers(labelled, write.settle) ?? labelled;
  }
  return plan.hasMarkers(write.path) ? relabelMarkers(content) : content;
}
