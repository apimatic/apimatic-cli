import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { prerenderPages } from '../../portal-template/prerender-pages';

// The list this builds is the whole of what a static build writes: TanStack's crawler is off,
// so a URL missing here is a page that is never emitted, however many things link to it.
describe('prerenderPages', () => {
  let contentDir: string;

  const write = (relative: string, body = '# page\n') => {
    const target = path.join(contentDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  };

  const urlsFor = async (siteUrl: string | null = null) => {
    const pages = await prerenderPages({
      title: 'Calc',
      description: null,
      logoUrl: null,
      siteUrl,
      aiPageActions: true,
      specs: {},
      contentDir,
      staticDir: null
    });
    return pages.map((page) => page.path);
  };

  beforeEach(() => {
    contentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prerender-'));
  });

  afterEach(() => {
    fs.rmSync(contentDir, { recursive: true, force: true });
  });

  it('lists a page per Markdown file, with its Markdown twin', async () => {
    write('index.md');
    write('guides/writing.md');

    const urls = await urlsFor();

    expect(urls).to.include('/');
    expect(urls).to.include('/guides/writing');
    expect(urls).to.include('/guides/writing.md');
    expect(urls).to.include('/index.md');
  });

  // `guides.md` and `guides/index.md` both collapse to "guides"; the content source settles
  // it by appending "index" to the index file. Emitting one URL for the two left the page
  // the source had moved with no file, while the sidebar and sitemap linked to it.
  it('gives a colliding index file the URL the content source moves it to', async () => {
    write('guides.md');
    write('guides/index.md');

    const urls = await urlsFor();

    expect(urls).to.include('/guides');
    expect(urls).to.include('/guides/index');
  });

  it('leaves an index file alone when nothing collides with it', async () => {
    write('guides/index.md');

    const urls = await urlsFor();

    expect(urls).to.include('/guides');
    expect(urls).to.not.include('/guides/index');
  });

  it('emits the sitemap and robots only for a portal that declares its address', async () => {
    write('index.md');

    expect(await urlsFor(null)).to.not.include('/sitemap.xml');
    expect(await urlsFor('https://docs.test')).to.include('/sitemap.xml');
    expect(await urlsFor('https://docs.test')).to.include('/robots.txt');
  });

  it('does not ask for a Markdown twin of the generated files', async () => {
    write('index.md');

    const urls = await urlsFor('https://docs.test');

    for (const generated of ['/llms.txt.md', '/llms-full.txt.md', '/sitemap.xml.md', '/robots.txt.md', '/api/search.json.md']) {
      expect(urls, `asked for a Markdown twin of ${generated}`).to.not.include(generated);
    }
  });
});
