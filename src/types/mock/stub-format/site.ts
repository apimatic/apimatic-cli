import { pointerSegment } from '../json/json-pointer.js';

/** Where the parser is inside a file: the stub being read and a JSON pointer to the member. */
export interface Site {
  readonly stub: string;
  readonly pointer: string;
}

export function at(site: Site, ...segments: (string | number)[]): Site {
  const deeper = segments.map((segment) => `/${pointerSegment(String(segment))}`).join('');
  return { stub: site.stub, pointer: site.pointer + deeper };
}
