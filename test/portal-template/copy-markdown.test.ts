import { expect } from 'chai';
import sinon from 'sinon';
import { setImmediate } from 'node:timers/promises';
import { copyMarkdown } from '../../portal-template/src/lib/copy-markdown';

class FakeClipboardItem {
  constructor(readonly items: Record<string, Promise<string>>) {}
}

describe('copying a page as Markdown', () => {
  let clipboard: string;

  beforeEach(() => {
    clipboard = 'before';
    sinon.define(globalThis, 'ClipboardItem', FakeClipboardItem);
    sinon.define(globalThis.navigator, 'clipboard', {
      write: async ([item]: FakeClipboardItem[]) => {
        clipboard = await item.items['text/plain'];
      }
    });
  });

  afterEach(() => sinon.restore());

  it('puts the Markdown fetched under the base path on the clipboard', async () => {
    const fetch = sinon.stub(globalThis, 'fetch').resolves(new globalThis.Response('# Intro'));

    await copyMarkdown('/guides/intro.md', '/docs/');

    expect(fetch.firstCall.args[0]).to.equal('/docs/guides/intro.md');
    expect(clipboard).to.equal('# Intro');
  });

  it('fetches from the root when the site is hosted there', async () => {
    const fetch = sinon.stub(globalThis, 'fetch').resolves(new globalThis.Response('# Intro'));

    await copyMarkdown('/guides/intro.md', '/');

    expect(fetch.firstCall.args[0]).to.equal('/guides/intro.md');
  });

  it('rejects on an error response and leaves the clipboard as it was', async () => {
    sinon.stub(globalThis, 'fetch').resolves(new globalThis.Response('<html>Not Found</html>', { status: 404 }));

    const error = await copyMarkdown('/guides/missing.md', '/').catch((reason: unknown) => reason);

    expect(error).to.be.an('error').with.property('message', 'Failed to fetch /guides/missing.md: 404');
    expect(clipboard).to.equal('before');
  });

  it('rejects when the request gets no response and leaves the clipboard as it was', async () => {
    const offline = new TypeError('Failed to fetch');
    sinon.stub(globalThis, 'fetch').rejects(offline);

    const error = await copyMarkdown('/guides/offline.md', '/').catch((reason: unknown) => reason);

    expect(error).to.equal(offline);
    expect(clipboard).to.equal('before');
  });

  it('rejects when the clipboard refuses the write', async () => {
    sinon.stub(globalThis, 'fetch').resolves(new globalThis.Response('# Denied'));
    const denied = new globalThis.DOMException('Write permission denied.', 'NotAllowedError');
    sinon.stub(globalThis.navigator.clipboard, 'write').rejects(denied);

    const error = await copyMarkdown('/guides/denied.md', '/').catch((reason: unknown) => reason);

    expect(error).to.equal(denied);
    expect(clipboard).to.equal('before');
  });

  it('rejects with the refusal, and leaves no rejection unhandled, when the clipboard refuses before the fetch fails', async () => {
    sinon.stub(globalThis, 'fetch').resolves(new globalThis.Response('<html>Not Found</html>', { status: 404 }));
    const blocked = new globalThis.DOMException('Blocked by a permissions policy.', 'NotAllowedError');
    sinon.stub(globalThis.navigator.clipboard, 'write').rejects(blocked);
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.prependListener('unhandledRejection', record);

    const error = await copyMarkdown('/guides/blocked.md', '/').catch((reason: unknown) => reason);
    await setImmediate();
    process.off('unhandledRejection', record);

    expect(error).to.equal(blocked);
    expect(unhandled).to.be.empty;
  });
});
