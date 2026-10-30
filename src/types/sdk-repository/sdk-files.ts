import { Buffer } from 'node:buffer';
import { err, ok, Result } from 'neverthrow';
import { FileService } from '../../infrastructure/file-service.js';
import { GitService } from '../../infrastructure/git-service.js';
import { ValueMap } from '../common/value-map.js';
import { DirectoryPath } from '../file/directoryPath.js';
import { FilePath } from '../file/filePath.js';
import { RelativeFilePath } from '../file/relativeFilePath.js';
import { BlobId } from '../git/blob-id.js';
import { CommitId } from '../git/commit-id.js';
import { relabelMarkers, settleMarkers } from '../sdk/conflict-markers.js';
import { keepsLineEndings, lineEndingFor } from '../sdk/file-content.js';
import { FileWrite, MergePlan } from '../sdk/merge-plan.js';
import { NotApplied, RepositoryProblem, WriteProblem } from '../sdk/repository-state.js';
import { SnapshotRef } from '../sdk/snapshot-ref.js';
import { onDisk } from './on-disk.js';

/** The files on disk below an SDK directory: a plan landed, undone from a snapshot when a step fails, a file read or settled. */
export class SdkFiles {
  private readonly fileService = new FileService();
  private readonly git = new GitService();

  constructor(private readonly sdk: DirectoryPath) {}

  /** Removals before writes, so a case-only rename lands on a filesystem that ignores case; a failed step puts back what came before it. */
  public async apply(
    plan: MergePlan,
    previous: { commit: CommitId; ref: SnapshotRef },
    generated: DirectoryPath
  ): Promise<Result<void, WriteProblem>> {
    const blobs = await this.git.readBlobs(
      this.sdk,
      plan.writes.map((write) => write.blob)
    );
    if (blobs.isErr()) {
      return err(blobs.error);
    }
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
          const content = markersOf(plan, write, blobs.value.get(write.blob)!);
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
    const restored = await this.restore(previous.commit, touched);
    return restored.match(
      () => ({ kind: 'done' }),
      (problem) => ({ kind: 'failed', reason: problem.reason, previous: previous.ref })
    );
  }

  private async restore(
    previous: CommitId,
    touched: readonly RelativeFilePath[]
  ): Promise<Result<void, RepositoryProblem>> {
    const entries = await this.git.listTree(this.sdk, previous);
    if (entries.isErr()) {
      return err(entries.error);
    }
    const kept = new ValueMap(entries.value.map((entry): [RelativeFilePath, BlobId] => [entry.path, entry.oid]));
    const blobs = await this.git.readBlobs(
      this.sdk,
      touched.flatMap((relative) => kept.get(relative) ?? [])
    );
    if (blobs.isErr()) {
      return err(blobs.error);
    }
    for (const relative of touched) {
      const oid = kept.get(relative);
      const restored = await onDisk(
        oid === undefined ? this.remove(relative.in(this.sdk)) : this.put(relative.in(this.sdk), blobs.value.get(oid)!)
      );
      if (restored.isErr()) {
        return err(restored.error);
      }
    }
    return ok(undefined);
  }

  /** The file as it is, or none when it is not there. */
  public contentOf(relative: RelativeFilePath): Promise<Result<Uint8Array | undefined, RepositoryProblem>> {
    return onDisk(this.read(relative.in(this.sdk)));
  }

  /** Writes the file with its own line ending, or removes it when there is nothing to settle it to. */
  public settle(relative: RelativeFilePath, content: Uint8Array | undefined): Promise<Result<void, RepositoryProblem>> {
    const file = relative.in(this.sdk);
    return onDisk(
      content === undefined
        ? this.fileService.deleteFile(file)
        : this.withLineEnding(content, file).then((bytes) => this.put(file, bytes))
    );
  }

  private async read(file: FilePath): Promise<Uint8Array | undefined> {
    return (await this.fileService.fileExists(file)) ? this.fileService.getBytes(file) : undefined;
  }

  /** `content` ending its lines as the first of `samples` on disk does: the file itself, else the generator's copy. */
  private async withLineEnding(content: Uint8Array, ...samples: FilePath[]): Promise<Uint8Array> {
    if (keepsLineEndings(content)) {
      return content;
    }
    for (const sample of samples) {
      const bytes = await this.read(sample);
      if (bytes !== undefined) {
        return lineEndingFor(content, bytes);
      }
    }
    return content;
  }

  private async put(file: FilePath, content: Uint8Array): Promise<void> {
    const current = await this.read(file);
    if (current !== undefined && Buffer.from(current).equals(content)) {
      return;
    }
    await this.fileService.writeBytes(file, content);
  }

  private async remove(file: FilePath): Promise<void> {
    await this.fileService.deleteFile(file);
    await this.fileService.removeEmptyDirectories(file.directory(), this.sdk);
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
