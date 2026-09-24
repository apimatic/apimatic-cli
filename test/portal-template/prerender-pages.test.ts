import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { prerenderPages } from '../../portal-template/prerender-pages';

// The list this builds is the whole of what a static build writes: TanStack's crawler is off,
// so a URL missing here is a page that is never emitted, however many things link to it.
describe('prerenderPages', () => {
  let contentDir: string;
  let generatedDir: string;

  const writeIn = (directory: string, relative: string, body: string) => {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  };
  const write = (relative: string, body = '# page\n') => writeIn(contentDir, relative, body);

  const urlsFor = async (siteUrl: string | null = null, specs: Record<string, string> = {}) => {
    const pages = await prerenderPages(
      { specs, codeSamples: null, contentDir, generatedDir, staticDir: null },
      siteUrl
    );
    return pages.map((page) => page.path);
  };

  beforeEach(() => {
    contentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prerender-'));
    generatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prerender-generated-'));
  });

  afterEach(() => {
    fs.rmSync(contentDir, { recursive: true, force: true });
    fs.rmSync(generatedDir, { recursive: true, force: true });
  });

  it('lists the generated pages as it lists the user’s, each with its Markdown twin', async () => {
    writeIn(generatedDir, 'sdks/index.mdx', '# SDKs\n');
    writeIn(generatedDir, 'sdks/typescript.mdx', '# TypeScript\n');
    writeIn(generatedDir, 'sdks/nav.json', '{ "title": "SDKs" }\n');
    writeIn(generatedDir, 'context-plugin/index.mdx', '# Plugin\n');

    const urls = await urlsFor();

    expect(urls).to.include.members([
      '/sdks',
      '/sdks.md',
      '/sdks/typescript',
      '/sdks/typescript.md',
      '/context-plugin',
      '/context-plugin.md'
    ]);
    expect(urls.filter((url) => url.includes('nav'))).to.be.empty;
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

    for (const generated of [
      '/llms.txt.md',
      '/llms-full.txt.md',
      '/sitemap.xml.md',
      '/robots.txt.md',
      '/api/search.json.md'
    ]) {
      expect(urls, `asked for a Markdown twin of ${generated}`).to.not.include(generated);
    }
  });

  // Through the sections the site is built from: a page listed here and not built is a 404 in
  // the output, and one built and not listed is never written.
  it('lists the reference pages the site keeps, deprecated included and internal left out', async () => {
    // Beside the pages, which only Markdown files are.
    const spec = path.join(contentDir, 'pets.json');
    const ok = { 200: { description: 'ok' } };
    fs.writeFileSync(
      spec,
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'Pets', version: '1' },
        paths: {
          '/pets': {
            get: { operationId: 'listPets', tags: ['pets'], responses: ok },
            post: { operationId: 'createPet', tags: ['pets'], deprecated: true, responses: ok },
            delete: { operationId: 'purgePets', tags: ['pets'], 'x-internal': true, responses: ok }
          }
        }
      })
    );
    const reference = (await urlsFor(null, { pets: spec })).filter((url) => url.startsWith('/api/pets/')).sort();

    expect(reference).to.deep.equal([
      '/api/pets/pets/createPet',
      '/api/pets/pets/createPet.md',
      '/api/pets/pets/listPets',
      '/api/pets/pets/listPets.md'
    ]);
  });

  it('suffixes each page once, however many pages there are', async () => {
    write('index.md');
    write('guides.md');
    write('reference/auth.md');

    const urls = await urlsFor('https://docs.test');

    expect(urls.filter((url) => url.endsWith('.md.md'))).to.be.empty;
    expect(urls).to.include('/guides.md');
    expect(urls).to.include('/reference/auth.md');
  });
});
