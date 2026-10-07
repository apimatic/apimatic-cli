import { FilePath } from '../file/filePath.js';
import { PortalSpec } from './portal-source.js';
import { PreviewRefusal } from './preview-refusal.js';

/** The documents put in `spec/`, or taken out of it, since the preview started. */
export interface SpecsChange {
  added: FilePath[];
  removed: FilePath[];
}

/** The preview serves only the documents it started with, so a change to which are in `spec/` is said once. */
export class PreviewSpecs {
  private readonly served: FilePath[];
  private said: FilePath[];
  private readonly refusal = new PreviewRefusal();

  /** `startup`: the documents the preview started with. */
  constructor(startup: PortalSpec[]) {
    this.served = startup.map(({ file }) => file);
    this.said = this.served;
  }

  public refuse(): void {
    this.refusal.refuse();
  }

  /** Records the documents as shown: whether `spec/` is fixed, having been refused, and a change not yet warned of. */
  public show(specs: PortalSpec[]): { fixed: boolean; change: SpecsChange | null } {
    const files = specs.map(({ file }) => file);
    const unchanged = isSameSet(files, this.said) || isSameSet(files, this.served);
    this.said = files;
    const change = { added: notIn(files, this.served), removed: notIn(this.served, files) };
    return { fixed: this.refusal.accept(), change: unchanged ? null : change };
  }
}

function notIn(files: FilePath[], others: FilePath[]): FilePath[] {
  return files.filter((file) => !others.some((other) => other.isEqual(file)));
}

function isSameSet(left: FilePath[], right: FilePath[]): boolean {
  return notIn(left, right).length === 0 && notIn(right, left).length === 0;
}
