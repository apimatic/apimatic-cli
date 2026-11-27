import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers';
import { expect } from 'chai';
import { writePaced } from '../../../src/infrastructure/mock/paced-body.js';

/** Long enough that a pause taken in error cannot hide in a slow run: anything under half of it was none. */
const LONG_PAUSE_MS = 10_000;

const turn = () => new Promise((resolve) => setImmediate(resolve));
const after = (ms: number, act: () => void) => setTimeout(act, ms);

async function timed(act: () => Promise<void>): Promise<number> {
  const started = Date.now();
  await act();
  return Date.now() - started;
}

describe('writePaced', () => {
  let stopping: AbortController;
  let body: PassThrough;
  let sent: string[];

  beforeEach(() => {
    stopping = new AbortController();
    body = new PassThrough();
    sent = [];
    body.on('data', (chunk) => sent.push(String(chunk)));
  });

  afterEach(() => {
    stopping.abort();
  });

  it('writes the first chunk at once, however long the pause', async () => {
    void writePaced(body, ['a', 'b'], LONG_PAUSE_MS, stopping.signal);

    await turn();

    expect(sent).to.deep.equal(['a']);
  });

  it('waits the pause before the next chunk', async () => {
    const elapsed = await timed(() => writePaced(body, ['a', 'b'], 300, stopping.signal));

    await turn();
    expect([sent, elapsed >= 250]).to.deep.equal([['a', 'b'], true]);
  });

  it('writes every chunk in order, each on its own, and ends the body', async () => {
    await writePaced(body, ['a', 'b', 'c'], 1, stopping.signal);

    await turn();
    expect([sent, body.writableEnded]).to.deep.equal([['a', 'b', 'c'], true]);
  });

  it('does not pause after the last chunk', async () => {
    const elapsed = await timed(() => writePaced(body, ['only'], LONG_PAUSE_MS, stopping.signal));

    expect([elapsed < LONG_PAUSE_MS / 2, body.writableEnded]).to.deep.equal([true, true]);
  });

  it('ends a body without chunks at once', async () => {
    await writePaced(body, [], LONG_PAUSE_MS, stopping.signal);

    expect([sent, body.writableEnded]).to.deep.equal([[], true]);
  });

  it('ends the body without the next chunk when the host stops during the pause', async () => {
    after(100, () => stopping.abort());

    const elapsed = await timed(() => writePaced(body, ['a', 'b'], LONG_PAUSE_MS, stopping.signal));

    await turn();
    expect([sent, elapsed < LONG_PAUSE_MS / 2, body.writableEnded]).to.deep.equal([['a'], true, true]);
  });

  it('writes nothing to a host that has already stopped', async () => {
    stopping.abort();

    await writePaced(body, ['a', 'b'], LONG_PAUSE_MS, stopping.signal);

    await turn();
    expect([sent, body.writableEnded]).to.deep.equal([[], true]);
  });

  it('stops at once when the client leaves during the pause', async () => {
    after(100, () => body.destroy());

    const elapsed = await timed(() => writePaced(body, ['a', 'b'], LONG_PAUSE_MS, stopping.signal));

    expect([sent, elapsed < LONG_PAUSE_MS / 2]).to.deep.equal([['a'], true]);
  });
});
