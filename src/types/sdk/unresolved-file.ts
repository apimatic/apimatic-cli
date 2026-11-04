import { RelativeFilePath } from '../file/relativeFilePath.js';
import { MergedText, Side } from './conflict-markers.js';
import { Settlement } from './conflict.js';
import { isBinary } from './file-content.js';

/**
 * A file git still holds as unmerged, as the last run left it: what is on disk now, and the two
 * sides git kept in the index; none where a side has no file, or the disk none.
 */
export class UnresolvedFile {
  constructor(
    private readonly path: RelativeFilePath,
    private readonly disk: Uint8Array | undefined,
    private readonly yours: Uint8Array | undefined,
    private readonly generated: Uint8Array | undefined
  ) {}

  /**
   * How the file settles for `side`: markers still on disk settle in place; a file a side lacks, or a
   * binary one, takes that side whole, the generator's side keeping yours where it has none and yours
   * staying deleted where you have none; text whose markers are gone was resolved by hand and stays.
   */
  public settledFor(side: Side): Settlement {
    const marked = this.disk === undefined ? undefined : MergedText.parse(this.disk);
    if (marked?.hasMarkers()) {
      return Settlement.merged({ path: this.path, content: marked.settledFor(side) });
    }
    const whole =
      this.yours === undefined || this.generated === undefined || isBinary(this.yours) || isBinary(this.generated);
    if (!whole) {
      return Settlement.kept(this.path);
    }
    if (side === 'generated' && this.generated !== undefined) {
      return Settlement.updated({ path: this.path, content: this.generated });
    }
    return this.yours === undefined ? Settlement.removed(this.path) : Settlement.kept(this.path);
  }
}
