import { Buffer } from 'node:buffer';
import { SdkPath } from './sdk-path.js';

const PRISTINE = 'refs/apimatic/pristine';
const PREVIOUS = 'refs/apimatic/previous';

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

/** A hidden ref holding one SDK directory's snapshots, named after the directory's path so each has its own. */
export class SnapshotRef {
  private readonly name: string;

  private constructor(name: string) {
    this.name = name;
  }

  public static pristine(sdkPath: SdkPath): SnapshotRef {
    return new SnapshotRef(sdkPath.isRoot() ? PRISTINE : `${PRISTINE}/${encodePath(sdkPath)}`);
  }

  public static previous(sdkPath: SdkPath): SnapshotRef {
    return new SnapshotRef(sdkPath.isRoot() ? PREVIOUS : `${PREVIOUS}/${encodePath(sdkPath)}`);
  }

  /** A ref as git lists it, below one of the namespaces. */
  public static fromGit(name: string): SnapshotRef {
    return new SnapshotRef(name);
  }

  /** Where git keeps every pristine ref, for listing them. */
  public static pristineNamespace(): string {
    return PRISTINE;
  }

  /** The SDK directory's path below the repository root, which the ref is named after. */
  public sdkPath(): SdkPath {
    const namespace = this.name.startsWith(PREVIOUS) ? PREVIOUS : PRISTINE;
    return SdkPath.fromGit(decodeURIComponent(this.name.slice(namespace.length + 1)));
  }

  /** Git stores refs as files in directories, so a ref cannot sit on another ref's path. */
  public collidesWith(other: SnapshotRef): boolean {
    return (
      this.name !== other.name && (other.name.startsWith(`${this.name}/`) || this.name.startsWith(`${other.name}/`))
    );
  }

  public toString(): string {
    return this.name;
  }
}
