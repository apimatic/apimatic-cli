import { settleMarkers } from './conflict-markers.js';
import { chosen, ConflictSide } from './merge-plan.js';

/** A file git still holds as unmerged: as it is now, and the two sides git kept in the index. */
export type UnresolvedFile = {
  /** The file on disk; none when it is not there. */
  disk: Uint8Array | undefined;
  /** Your version when the run merged; none when you had deleted the file. */
  yours: Uint8Array | undefined;
  /** The generator's version; none when the generator no longer produces the file. */
  generated: Uint8Array | undefined;
};

// Git's own test: a NUL in the first 8000 bytes makes a file binary, and a binary file is never merged line by line.
const isBinary = (content: Uint8Array | undefined): boolean =>
  content !== undefined && content.subarray(0, 8000).includes(0);

/**
 * Markers still in the file settle in place; a file git could not merge line by line settles
 * whole as `chosen` decides; one whose markers are gone was resolved by hand and stays. None where it stays deleted.
 */
export function settledContent(side: ConflictSide, file: UnresolvedFile): Uint8Array | undefined {
  const marked = file.disk === undefined ? undefined : settleMarkers(file.disk, side);
  if (marked !== undefined) {
    return marked;
  }
  const whole =
    file.yours === undefined || file.generated === undefined || isBinary(file.yours) || isBinary(file.generated);
  if (!whole) {
    return file.disk;
  }
  const content = chosen(side, file);
  if (content === undefined) {
    return undefined;
  }
  return content === file.yours ? file.disk : content;
}
