import { isCancel, confirm, log } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { CommitId } from '../../types/git/commit-id.js';
import { GitVersion } from '../../types/git/git-version.js';
import { describeGeneration, SdkGeneration } from '../../types/sdk/generation-record.js';
import { SnapshotFetch } from '../../types/sdk-repository-context.js';
import { SnapshotRef } from '../../types/sdk/snapshot-ref.js';
import { format as f } from '../format.js';

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export class SdkPreparePrompts {
  public async overwriteSdk(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination ${f.path(directory)} is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public destinationDirNotEmpty() {
    const message = `Please enter a different destination folder or remove the existing files and try again.`;
    log.error(message);
  }

  public gitUnavailable(found: GitVersion | undefined) {
    const reason =
      found === undefined
        ? 'git was not found'
        : `git ${found} was found, but ${GitVersion.required()} or newer is needed`;
    log.warn(`${reason}, so your customizations to the generated SDK will not persist across regenerations.`);
  }

  public nestedSdkDirectory(reason: string) {
    log.error(`The SDK cannot be generated here: ${reason}.`);
  }

  public directoryNotInspected(reason: string) {
    log.error(`The SDK directory could not be inspected for your customizations: ${reason}`);
  }

  public recordNotForThisGeneration(recorded: SdkGeneration, requested: SdkGeneration, sdk: DirectoryPath) {
    const message =
      `${f.relativePath(sdk)} was last generated as ${describeGeneration(recorded)}; ` +
      `a ${describeGeneration(requested)} SDK cannot be merged into it and will replace it.`;
    log.warn(message);
  }

  public snapshotMissing(commit: CommitId, root: DirectoryPath, ref: SnapshotRef, fetch: SnapshotFetch) {
    const message =
      `The snapshot this SDK was generated from, commit ${f.var(commit.toString())}, is not in the repository at ` +
      `${f.relativePath(root)}, so your customizations cannot be merged. ${whereItWent(fetch)}\n` +
      `${howToShare(fetch, ref)}\n` +
      `Otherwise the SDK will be replaced and a fresh snapshot recorded.`;
    log.warn(message);
  }

  public snapshotsFetched(remote: string) {
    log.info(`Fetched the SDK's snapshots from ${f.var(remote)}.`);
  }

  public conflictsUnresolved(paths: readonly RelativeFilePath[], sdk: DirectoryPath) {
    const one = paths.length === 1;
    const message =
      `${plural(paths.length, 'file')} still hold${one ? 's' : ''} conflict markers from the last run. ` +
      `Resolve ${one ? 'it' : 'them'} and remove the markers, then rerun:\n` +
      paths.map((path) => `  ${f.relativePath(path.in(sdk))}`).join('\n');
    log.error(message);
  }
}

function whereItWent(fetch: SnapshotFetch): string {
  switch (fetch.kind) {
    case 'noRemote':
      return 'The repository has no remote to fetch it from.';
    case 'absent':
      return `${f.var(fetch.remote)} does not have it either.`;
    case 'failed':
      return `It could not be fetched from ${f.var(fetch.remote)}: ${fetch.reason}`;
  }
}

function howToShare(fetch: SnapshotFetch, ref: SnapshotRef): string {
  const remote = fetch.kind === 'noRemote' ? '<remote>' : fetch.remote;
  return (
    `Whoever generated it shares it by regenerating with a remote, or with ${f.cmd(
      'git',
      'push',
      remote,
      ref.refspec()
    )}; ` +
    `then rerun here${fetch.kind === 'noRemote' ? ` after ${f.cmd('git', 'fetch', remote, ref.forcedRefspec())}` : ''}.`
  );
}
