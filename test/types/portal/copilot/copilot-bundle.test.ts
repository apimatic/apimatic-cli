import { gunzipSync } from 'node:zlib';
import { expect } from 'chai';
import { SiteAddress } from '../../../../src/types/portal/config/site-address';
import { BundlePage, CopilotBundle } from '../../../../src/types/portal/copilot/copilot-bundle';

const AT = new Date('2026-10-14T12:00:00.000Z');

const PAGES: BundlePage[] = [
  { path: '/', title: 'Welcome', description: 'Start here', markdown: '# Welcome' },
  { path: '/guides/intro', title: 'Intro', description: null, markdown: '# Intro' }
];

const at = (url: string) => SiteAddress.parse(url, 'url')._unsafeUnwrap();

const documentOf = (bundle: CopilotBundle) => JSON.parse(gunzipSync(bundle.gzipped()).toString('utf8')) as unknown;

describe('CopilotBundle', () => {
  it("holds the pages in the service's format, a page without a description leaving the key out", () => {
    const bundle = CopilotBundle.of(PAGES, null, '9.9.9', AT);

    expect(bundle.pageCount()).to.equal(2);
    expect(documentOf(bundle)).to.deep.equal({
      formatVersion: 1,
      generator: { name: 'apimatic-cli', version: '9.9.9' },
      generatedAt: '2026-10-14T12:00:00.000Z',
      siteUrl: null,
      basePath: '/',
      pages: [
        { path: '/', title: 'Welcome', description: 'Start here', markdown: '# Welcome' },
        { path: '/guides/intro', title: 'Intro', markdown: '# Intro' }
      ]
    });
  });

  it('names the address a portal served under a path is at, and that path', () => {
    const bundle = CopilotBundle.of(PAGES, at('https://example.com/docs'), '9.9.9', AT);

    expect(documentOf(bundle)).to.deep.include({ siteUrl: 'https://example.com/docs', basePath: '/docs/' });
  });

  describe('parse', () => {
    it('reads back a bundle, keeping its exact bytes', () => {
      const json = CopilotBundle.of(PAGES, at('https://example.com/docs'), '9.9.9', AT).toJson();

      const bundle = CopilotBundle.parse(json)!;

      expect(bundle.toJson()).to.equal(json);
      expect(bundle.pageCount()).to.equal(2);
      expect(bundle.buildManifest()).to.equal(CopilotBundle.parse(json)!.buildManifest());
    });

    it('refuses anything that is not a bundle of this format', () => {
      const valid = JSON.parse(CopilotBundle.of(PAGES, null, '9.9.9', AT).toJson()) as Record<string, unknown>;

      for (const [label, json] of [
        ['text that is not JSON', '{'],
        ['another format version', JSON.stringify({ ...valid, formatVersion: 2 })],
        ['pages that are not a list', JSON.stringify({ ...valid, pages: {} })],
        ['a page without its Markdown', JSON.stringify({ ...valid, pages: [{ path: '/', title: 'Welcome' }] })],
        ['a page that is not an object', JSON.stringify({ ...valid, pages: ['/'] })]
      ]) {
        expect(CopilotBundle.parse(json!), label).to.be.null;
      }
    });
  });

  describe('build ID', () => {
    const buildId = (pages = PAGES, site: SiteAddress | null = null, cliVersion = '9.9.9', when = AT) =>
      (JSON.parse(CopilotBundle.of(pages, site, cliVersion, when).buildManifest()) as { buildId: string }).buildId;

    it('is a SHA-256 in hex, in format version 1', () => {
      const manifest = JSON.parse(CopilotBundle.of(PAGES, null, '9.9.9', AT).buildManifest()) as unknown;

      expect(manifest).to.deep.include({ formatVersion: 1 });
      expect(buildId()).to.match(/^[0-9a-f]{64}$/);
    });

    it('stays the same when the same pages are generated again, at another time or by another CLI', () => {
      expect(buildId(PAGES, null, '9.9.9', new Date('2027-01-01T00:00:00.000Z'))).to.equal(buildId());
      expect(buildId(PAGES, null, '10.0.0')).to.equal(buildId());
    });

    it('changes with a page', () => {
      const changed = [{ ...PAGES[0]!, markdown: '# Welcome back' }, PAGES[1]!];

      expect(buildId(changed)).to.not.equal(buildId());
    });

    it('changes with the address the pages are served at', () => {
      expect(buildId(PAGES, at('https://example.com/docs'))).to.not.equal(
        buildId(PAGES, at('https://example.com/api'))
      );
    });
  });
});
