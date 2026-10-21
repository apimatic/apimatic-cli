import { isCancel, confirm, log } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { RelativeFilePath } from '../../types/file/relativeFilePath.js';
import { GitVersion } from '../../types/git/git-version.js';
import { describeApart, SdkGeneration } from '../../types/sdk/generation-record.js';
import { NestedSdkDirectory, SnapshotFetch } from '../../types/sdk-repository-context.js';
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

  public nestedSdkDirectory(sdk: DirectoryPath, nested: NestedSdkDirectory) {
    const where = nested.encloses
      ? `it sits inside the SDK at ${f.relativePath(nested.other)}`
      : `the SDK at ${f.relativePath(nested.other)} sits inside it`;
    log.error(`The SDK cannot be generated at ${f.relativePath(sdk)}: ${where}.`);
  }

  public directoryNotInspected(reason: string) {
    log.error(`The SDK directory could not be inspected for your customizations: ${reason}`);
  }

  public recordNotForThisGeneration(recorded: SdkGeneration, requested: SdkGeneration, sdk: DirectoryPath) {
    const [was, now] = describeApart(recorded, requested);
    log.warn(`${f.relativePath(sdk)} holds a ${was} SDK; a ${now} SDK cannot be merged into it.`);
  }

  public snapshotMissing(fetch: SnapshotFetch) {
    const message =
      `The snapshot this SDK was generated from is not available ${whereItWasLookedFor(fetch)}, ` +
      `so the new SDK cannot be merged into it.`;
    log.warn(message);
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

function whereItWasLookedFor(fetch: SnapshotFetch): string {
  switch (fetch.kind) {
    case 'noRemote':
      return 'here, and there is no remote to fetch it from';
    case 'absent':
      return `here or on ${f.var(fetch.remote)}`;
    case 'failed':
      return `here, and could not be fetched from ${f.var(fetch.remote)} (${fetch.reason})`;
  }
}
