import { settleMarkers } from './conflict-markers.js';
import { chosen, ConflictSide } from './merge-plan.js';

/**
 * A file the last run left in conflict and git still holds as unmerged: as it is now, and the
 * two sides git kept for it in the index, stage 2 being yours and stage 3 the generator's.
 */
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
 * The file's content once its remaining conflict is settled for `side`; none where it stays
 * deleted. Markers still in the file are settled in place, keeping every line around them.
 * Without markers, a file git could not merge line by line, because one side has no version
 * or it is binary, settles whole as `chosen` decides, yours being the file as it is on disk. A
 * text file whose markers are all gone was resolved by hand and stays as it is.
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
