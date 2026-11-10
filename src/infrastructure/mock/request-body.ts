import { Buffer } from 'node:buffer';
import { IncomingMessage } from 'node:http';
import { err, ok, Result } from 'neverthrow';
import { declaredTooLong, MAX_BODY_BYTES, undeclaredTooLong } from '../../types/mock/routing/body-limit.js';

/**
 * The body's bytes as sent, read for every method (a body on a GET is a mistake a stub should be
 * able to catch), or why it is too long. A body that declares too much is never kept, and one that
 * declares nothing is dropped where it passes the limit. Either way the rest of the upload is
 * received and thrown away before the refusal goes out: a server that answers and closes in the
 * middle of an upload resets the connection, and most clients then never see the answer.
 */
export function readBody(request: IncomingMessage): Promise<Result<Buffer, string>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    let refusal = declaredTooLong(request.headers['content-length']);
    request.on('data', (chunk: Buffer) => {
      length += chunk.length;
      if (refusal === undefined && length <= MAX_BODY_BYTES) {
        chunks.push(chunk);
      } else {
        refusal ??= undeclaredTooLong();
        chunks.length = 0;
      }
    });
    request.on('end', () => resolve(refusal === undefined ? ok(Buffer.concat(chunks)) : err(refusal)));
    request.on('error', reject);
    request.on('close', () => reject(new Error('The client left before its request was complete.')));
  });
}
