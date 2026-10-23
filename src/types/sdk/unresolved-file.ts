import { TextDecoder, TextEncoder } from 'node:util';
import { resolveMarkers } from './conflict-markers.js';
import { ConflictSide } from './merge-plan.js';

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

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

// Git's own test: a NUL in the first 8000 bytes makes a file binary, and a binary file is never merged line by line.
const isBinary = (content: Uint8Array | undefined): boolean =>
  content !== undefined && content.subarray(0, 8000).includes(0);

function withMarkersResolved(content: Uint8Array, side: ConflictSide): Uint8Array | undefined {
  let text: string;
  try {
    text = decoder.decode(content);
  } catch {
    return undefined;
  }
  const resolved = resolveMarkers(text, side);
  return resolved === text ? undefined : encoder.encode(resolved);
}

/**
 * The file's content once its remaining conflict is settled for `side`; none where that side
 * removes it. Markers still in the file are settled in place, keeping every line around them.
 * Without markers, whichever side git could not merge decides: a file one side deleted stays
 * or goes with that side, and a binary file takes that side's version. A text file whose
 * markers are all gone was resolved by hand and stays as it is.
 */
export function settledContent(side: ConflictSide, file: UnresolvedFile): Uint8Array | undefined {
  const marked = file.disk === undefined ? undefined : withMarkersResolved(file.disk, side);
  if (marked !== undefined) {
    return marked;
  }
  if (file.generated === undefined) {
    return side === 'generated' ? undefined : file.disk;
  }
  if (file.yours === undefined) {
    return side === 'yours' ? undefined : file.disk ?? file.generated;
  }
  if (isBinary(file.yours) || isBinary(file.generated)) {
    return side === 'generated' ? file.generated : file.disk ?? file.yours;
  }
  return file.disk;
}
