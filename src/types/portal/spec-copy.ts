import path from 'node:path';
import { DirectoryPath } from '../file/directoryPath.js';

/** The copy of `spec/` a build reads, which is deleted once the command exits. */
export class SpecCopy {
  private constructor(private readonly replacements: [string, string][]) {}

  public static none(): SpecCopy {
    return new SpecCopy([]);
  }

  public static of(original: DirectoryPath, copy: DirectoryPath): SpecCopy {
    const [from, to] = [copy.toString(), original.toString()];
    return new SpecCopy([
      [from, to],
      [toPosix(from), toPosix(to)]
    ]);
  }

  /** Points the paths in build output at the user's own files rather than the copy. */
  public restorePaths(text: string): string {
    return this.replacements.reduce((restored, [from, to]) => restored.split(from).join(to), text);
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
