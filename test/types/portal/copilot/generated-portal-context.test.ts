import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { expect } from 'chai';
import { DirectoryPath } from '../../../../src/types/file/directoryPath';
import { SiteAddress } from '../../../../src/types/portal/config/site-address';
import { GeneratedPortalContext } from '../../../../src/types/portal/copilot/generated-portal-context';

const AT = new Date('2026-10-14T12:00:00.000Z');

describe('GeneratedPortalContext', () => {
  let root: string;

  const write = (relative: string, contents: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };

  const bundle = (site: SiteAddress | null = null) =>
    new GeneratedPortalContext(new DirectoryPath(root)).bundle(site, '9.9.9', AT);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-portal-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('is null for a directory with no generated portal in it', async () => {
    expect(await bundle()).to.be.null;
  });

  it("bundles each listed page with its Markdown twin, the home page's being index.md", async () => {
    write(
      'llms.txt',
      [
        '- [Welcome](/): Start here',
        '  - [Intro](/guides/intro): Install',
        '  - [Missing](/guides/missing)',
        '  - [SDK](/__downloads/sdk.zip)'
      ].join('\n')
    );
    write('index.md', '# Welcome');
    write('guides/intro.md', '# Intro');

    const built = (await bundle())!;

    expect(built.pageCount()).to.equal(2);
    expect(JSON.parse(gunzipSync(built.gzipped()).toString('utf8'))).to.deep.equal({
      formatVersion: 1,
      generator: { name: 'apimatic-cli', version: '9.9.9' },
      generatedAt: '2026-10-14T12:00:00.000Z',
      siteUrl: null,
      basePath: '/',
      pages: [
        { path: '/', title: 'Welcome', description: 'Start here', markdown: '# Welcome' },
        { path: '/guides/intro', title: 'Intro', description: 'Install', markdown: '# Intro' }
      ]
    });
  });

  it('reads a portal served under a path, with its pages addressed from that path', async () => {
    write('llms.txt', ['- [Docs](/docs)', '- [Intro](/docs/guides/intro)'].join('\n'));
    write('index.md', '# Docs');
    write('guides/intro.md', '# Intro');

    const built = (await bundle(SiteAddress.parse('https://example.com/docs', 'url')._unsafeUnwrap()))!;

    const document = JSON.parse(gunzipSync(built.gzipped()).toString('utf8')) as {
      siteUrl: string | null;
      basePath: string;
      pages: { path: string; description?: string }[];
    };
    expect(document.siteUrl).to.equal('https://example.com/docs');
    expect(document.basePath).to.equal('/docs/');
    expect(document.pages.map(({ path: page }) => page)).to.deep.equal(['/', '/guides/intro']);
    expect(document.pages[0]).to.not.have.property('description');
  });

  it('has no pages when none of the listed ones has its Markdown twin', async () => {
    write('llms.txt', '- [Intro](/guides/intro)');

    expect((await bundle())!.pageCount()).to.equal(0);
  });

  describe('publish', () => {
    const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

    beforeEach(() => {
      write('llms.txt', '- [Welcome](/)');
      write('index.md', '# Welcome');
    });

    it('writes the bundle as plain JSON beside a build ID of its exact bytes', async () => {
      const built = (await bundle())!;

      expect((await new GeneratedPortalContext(new DirectoryPath(root)).publish(built)).isOk()).to.be.true;

      const json = read('__copilot/bundle.json');
      expect(JSON.parse(json)).to.deep.equal(JSON.parse(gunzipSync(built.gzipped()).toString('utf8')));
      expect(JSON.parse(read('__copilot/build.json'))).to.deep.equal({
        formatVersion: 1,
        buildId: createHash('sha256').update(json).digest('hex')
      });
    });

    it('names the same pages with the same build ID, and changed pages with another', async () => {
      const buildId = async () => (JSON.parse((await bundle())!.buildManifest()) as { buildId: string }).buildId;
      const first = await buildId();

      expect(await buildId()).to.equal(first);
      write('index.md', '# Welcome back');
      expect(await buildId()).to.not.equal(first);
    });

    it('reports a portal it cannot write to rather than throwing', async () => {
      const built = (await bundle())!;
      write('__copilot', 'a file where the directory goes');

      const published = await new GeneratedPortalContext(new DirectoryPath(root)).publish(built);

      expect(published.isErr()).to.be.true;
    });
  });
});
