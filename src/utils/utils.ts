import * as path from "path";
import { Buffer } from "buffer";
import stripTags from "striptags";

export const replaceHTML = (string: string) => {
  return stripTags(string);
};

export const getFileNameFromPath = (filePath: string) => {
  return path.basename(filePath).split(".")[0];
};

export async function parseStreamBodyToJson(body: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf-8");
  return JSON.parse(text);
}

// `destroy()` is not on `NodeJS.ReadableStream` — it lives on `stream.Readable`
// and `IncomingMessage` — so narrowing an `ApiError.body` union still won't let
// us call it. Probe for the method instead.
function isDestroyable(value: unknown): value is { destroy: () => void } {
  return typeof (value as { destroy?: unknown } | undefined)?.destroy === "function";
}

// Counterpart to `parseStreamBodyToJson`: releases a response body we are never
// going to read. An `ApiError.body` from a `callAsStream` endpoint is an
// undrained `IncomingMessage` whose socket keeps the Node event loop alive, so
// the CLI hangs after printing its outro — `outro()` only sets `process.exitCode`
// and we never call `process.exit()`.
//
// The axios adapter yields a stream on Node and a Blob elsewhere, so the probe
// above is a real platform branch. `destroy()` is idempotent, making this safe
// on bodies the SDK has already drained via `loadResult`. Callers that need the
// body must read it *before* calling this (see `PortalService.generatePortal`,
// which returns the 422 body as the error report).
export function discardStreamBody(body: unknown): void {
  if (isDestroyable(body)) {
    body.destroy();
  }
}

export const toPascalCase = (str: string): string => {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
};
