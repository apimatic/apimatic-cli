import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { expect } from 'chai';
import sinon from 'sinon';
import { FileService } from '../../../../src/infrastructure/file-service';
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
    new GeneratedPortalContext(new DirectoryPath(root))
      .bundle(site, '9.9.9', AT)
      .then((built) => built._unsafeUnwrap());

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-portal-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports a page it cannot read rather than throwing', async () => {
    write('llms.txt', '- [Welcome](/)');
    write('index.md', '# Welcome');
    const getContents = FileService.prototype.getContents;
    const unreadable = sinon.stub(FileService.prototype, 'getContents').callsFake(function (this: FileService, file) {
      return file.toString().endsWith('index.md')
        ? Promise.reject(new Error('EACCES: permission denied'))
        : getContents.call(this, file);
    });

    try {
      const built = await new GeneratedPortalContext(new DirectoryPath(root)).bundle(null, '9.9.9', AT);

      expect(built._unsafeUnwrapErr()).to.contain('EACCES: permission denied');
    } finally {
      unreadable.restore();
    }
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

    it('writes the bundle as plain JSON beside its build ID', async () => {
      const built = (await bundle())!;

      expect((await new GeneratedPortalContext(new DirectoryPath(root)).publish(built)).isOk()).to.be.true;

      const json = read('__copilot/bundle.json');
      expect(JSON.parse(json)).to.deep.equal(JSON.parse(gunzipSync(built.gzipped()).toString('utf8')));
      expect(read('__copilot/build.json')).to.equal(built.buildManifest());
    });

    describe('build ID', () => {
      const buildId = async (site: SiteAddress | null = null, cliVersion = '9.9.9', at = AT) => {
        const built = await new GeneratedPortalContext(new DirectoryPath(root)).bundle(site, cliVersion, at);
        return (JSON.parse(built._unsafeUnwrap()!.buildManifest()) as { formatVersion: number; buildId: string })
          .buildId;
      };

      it('is a SHA-256 in hex', async () => {
        expect(await buildId()).to.match(/^[0-9a-f]{64}$/);
      });

      it('stays the same when the same pages are generated again, at another time or by another CLI', async () => {
        const first = await buildId();

        expect(await buildId(null, '9.9.9', new Date('2027-01-01T00:00:00.000Z'))).to.equal(first);
        expect(await buildId(null, '10.0.0')).to.equal(first);
      });

      it('changes with a page', async () => {
        const first = await buildId();

        write('index.md', '# Welcome back');

        expect(await buildId()).to.not.equal(first);
      });

      it('changes with the address the pages are served at', async () => {
        const at = (url: string) => SiteAddress.parse(url, 'url')._unsafeUnwrap();

        expect(await buildId(at('https://example.com/docs'))).to.not.equal(
          await buildId(at('https://example.com/api'))
        );
      });
    });

    it('reports a portal it cannot write to rather than throwing', async () => {
      const built = (await bundle())!;
      write('__copilot', 'a file where the directory goes');

      const published = await new GeneratedPortalContext(new DirectoryPath(root)).publish(built);

      expect(published.isErr()).to.be.true;
    });
  });
});
