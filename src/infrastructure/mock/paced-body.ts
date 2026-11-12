import { Writable } from 'node:stream';
import { sleep } from '../timer-extensions.js';

/**
 * Each chunk is written on its own with a pause before the next, so a client that buffers the
 * whole body is told apart from one that streams; nothing is waited for after the last. The body
 * ends early when the client leaves or the host stops: a stream no one reads would keep its
 * connection, and a stop would wait for it.
 */
export async function writePaced(
  body: Writable,
  chunks: readonly string[],
  delayMs: number,
  stopping: AbortSignal
): Promise<void> {
  const left = new AbortController();
  body.once('close', () => left.abort());
  const ended = AbortSignal.any([stopping, left.signal]);
  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) {
      await sleep(delayMs, ended);
    }
    if (ended.aborted) {
      break;
    }
    body.write(chunk);
  }
  body.end();
}
