import * as path from 'path';
import stripTags from 'striptags';

// A link keeps its address, which is all the terminal can show of it, and a line break its line.
export const replaceHTML = (html: string): string =>
  stripTags(html.replace(/<a\s[^>]*?href="([^"]*)"[^>]*>.*?<\/a>/gis, '$1').replace(/<br\s*\/?>/gi, '\n'))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

export const getFileNameFromPath = (filePath: string) => {
  return path.basename(filePath).split('.')[0];
};

// `destroy()` is not on `NodeJS.ReadableStream` — it lives on `stream.Readable`
// and `IncomingMessage` — so narrowing an `ApiError.body` union still won't let
// us call it. Probe for the method instead.
function isDestroyable(value: unknown): value is { destroy: () => void } {
  return typeof (value as { destroy?: unknown })?.destroy === 'function';
}

// Releases a response body we are never going to read. An `ApiError.body` from a `callAsStream` endpoint is an
// undrained `IncomingMessage` whose socket keeps the Node event loop alive, so
// the CLI hangs after printing its outro — `outro()` only sets `process.exitCode`
// and we never call `process.exit()`.
//
// The axios adapter yields a stream on Node and a Blob elsewhere, so the probe
// above is a real platform branch. `destroy()` is idempotent, making this safe
// on bodies the SDK has already drained via `loadResult`. Callers that need the
// body must read it *before* calling this.
export function discardStreamBody(body: unknown): void {
  if (isDestroyable(body)) {
    body.destroy();
  }
}
