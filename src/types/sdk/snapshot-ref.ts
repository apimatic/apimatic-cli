import { Buffer } from 'node:buffer';
import { SdkPath } from './sdk-path.js';

/** Where every ref of the CLI's lives, so a tool can list or exclude them all at once. */
export const SNAPSHOT_REFS = 'refs/apimatic';
/** Where the pristine chains live, one ref per SDK directory; the hook pushes everything below it. */
export const PRISTINE_REFS = `${SNAPSHOT_REFS}/pristine`;

const PRISTINE = PRISTINE_REFS;
const PREVIOUS = `${SNAPSHOT_REFS}/previous`;

// A ref name may not hold a space, `~ ^ : ? * [ \`, `..`, `@{`, a control character, or a component
// that starts with `.` or ends in `.lock`; every byte outside this set goes in as `%XX`, and comes back.
const SAFE = /[A-Za-z0-9_-]/;

function encodeSegment(segment: string): string {
  return [...Buffer.from(segment, 'utf8')]
    .map((byte) => {
      const char = String.fromCharCode(byte);
      return byte < 0x80 && SAFE.test(char) ? char : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    })
    .join('');
}

const encodePath = (sdkPath: SdkPath): string => sdkPath.toString().split('/').map(encodeSegment).join('/');

/** The path a ref below `namespace` names, or none when it does not decode to one. */
function decodePath(name: string, namespace: string): SdkPath | undefined {
  try {
    return SdkPath.fromGit(decodeURIComponent(name.slice(namespace.length + 1)));
  } catch {
    return undefined;
  }
}

/** A hidden ref holding one SDK directory's snapshots, named after the directory's path so each has its own. */
export class SnapshotRef {
  private readonly name: string;
  private readonly path: SdkPath;

  private constructor(name: string, path: SdkPath) {
    this.name = name;
    this.path = path;
  }

  public static pristine(sdkPath: SdkPath): SnapshotRef {
    return new SnapshotRef(sdkPath.isRoot() ? PRISTINE : `${PRISTINE}/${encodePath(sdkPath)}`, sdkPath);
  }

  public static previous(sdkPath: SdkPath): SnapshotRef {
    return new SnapshotRef(sdkPath.isRoot() ? PREVIOUS : `${PREVIOUS}/${encodePath(sdkPath)}`, sdkPath);
  }

  /** A ref as git lists it: below one of the namespaces, naming an SDK path; none for any other ref. */
  public static fromGit(name: string): SnapshotRef | undefined {
    const namespace = [PRISTINE, PREVIOUS].find((each) => name === each || name.startsWith(`${each}/`));
    const path = namespace === undefined ? undefined : decodePath(name, namespace);
    return path === undefined ? undefined : new SnapshotRef(name, path);
  }

  /** The ref every pristine ref sits at or below: the root's own, which lists them all. */
  public static allPristine(): SnapshotRef {
    return SnapshotRef.pristine(SdkPath.root());
  }

  /** The SDK directory's path below the repository root, which the ref is named after. */
  public sdkPath(): SdkPath {
    return this.path;
  }

  public toString(): string {
    return this.name;
  }
}
