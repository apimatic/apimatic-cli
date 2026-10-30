import { createHash } from 'node:crypto';
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

  // An operation's description can run to thousands of characters; the service refuses a bundle past its limits.
  it("cuts a title and description to the service's limits, on a word boundary", () => {
    const long = { path: '/op', title: 'word '.repeat(200), description: 'word '.repeat(1500), markdown: '# Op' };

    const [page] = (documentOf(CopilotBundle.of([long], null, '9.9.9', AT)) as { pages: Record<string, string>[] })
      .pages;

    expect(page!.title!.length).to.be.at.most(500);
    expect(page!.description!.length).to.be.at.most(5000);
    expect(page!.description).to.match(/ word$/);
    expect(page!.markdown).to.equal('# Op');
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

    // The service fetches a deployed bundle.json and refuses it unless it hashes to this ID.
    it("is the SHA-256 of the bundle's exact bytes, in format version 1", () => {
      const bundle = CopilotBundle.of(PAGES, null, '9.9.9', AT);

      expect(JSON.parse(bundle.buildManifest())).to.deep.equal({
        formatVersion: 1,
        buildId: createHash('sha256').update(bundle.toJson()).digest('hex')
      });
    });

    // The service finds the same pages then and indexes nothing again; it only fetches the bundle once more.
    it('changes when the same pages are generated again, as the bytes do', () => {
      expect(buildId(PAGES, null, '9.9.9', new Date('2027-01-01T00:00:00.000Z'))).to.not.equal(buildId());
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
