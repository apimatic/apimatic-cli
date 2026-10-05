import { expect } from 'chai';
import sinon from 'sinon';
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
      },
      writeText: async (text: string) => {
        clipboard = text;
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

  it('copies the Markdown fetched on an earlier click without fetching it again', async () => {
    const fetch = sinon.stub(globalThis, 'fetch').resolves(new globalThis.Response('# Quickstart'));
    await copyMarkdown('/guides/quickstart.md', '/');
    clipboard = 'before';

    await copyMarkdown('/guides/quickstart.md', '/');

    expect(fetch.calledOnce).to.equal(true);
    expect(clipboard).to.equal('# Quickstart');
  });

  it('fetches again after a failed fetch', async () => {
    const fetch = sinon.stub(globalThis, 'fetch');
    fetch.onFirstCall().resolves(new globalThis.Response('<html>Not Found</html>', { status: 404 }));
    fetch.onSecondCall().resolves(new globalThis.Response('# Retry'));
    await copyMarkdown('/guides/retry.md', '/').catch(() => undefined);

    await copyMarkdown('/guides/retry.md', '/');

    expect(fetch.calledTwice).to.equal(true);
    expect(clipboard).to.equal('# Retry');
  });

  it('rejects on an error response and leaves the clipboard as it was', async () => {
    sinon.stub(globalThis, 'fetch').resolves(new globalThis.Response('<html>Not Found</html>', { status: 404 }));

    const error = await copyMarkdown('/guides/missing.md', '/').catch((reason: unknown) => reason);

    expect(error).to.be.an('error').with.property('message', 'Failed to fetch /guides/missing.md: 404');
    expect(clipboard).to.equal('before');
  });
});
