import { settleMarkers } from './conflict-markers.js';
import { isBinary } from './file-content.js';
import { chosen, ConflictSide, Sides } from './merge-plan.js';

/** A file git still holds as unmerged: as it is on disk now, and the two sides git kept in the index; none where a side has no file. */
export type UnresolvedFile = Sides<Uint8Array> & { disk: Uint8Array | undefined };

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
  const picked = chosen(side, file);
  if (picked === undefined) {
    return undefined;
  }
  return picked.side === 'yours' ? file.disk : picked.content;
}
