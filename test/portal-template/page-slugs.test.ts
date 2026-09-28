import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { loader } from 'fumadocs-core/source';
import { openApiSection } from '../../portal-template/src/lib/openapi-section.server';
import { decodeMarkdownUrl, slugsFromSplat } from '../../portal-template/src/lib/shared';

const ok = { 200: { description: 'ok' } };

describe('slugsFromSplat', () => {
  it('drops the empty segments a leading or trailing slash leaves behind', () => {
    expect(slugsFromSplat('guides/getting-started/')).to.deep.equal(['guides', 'getting-started']);
    expect(slugsFromSplat('')).to.deep.equal([]);
    expect(slugsFromSplat(undefined)).to.deep.equal([]);
  });

  it('leaves an ordinary slug exactly as it was', () => {
    expect(slugsFromSplat('api/openapi/pets/listPets')).to.deep.equal(['api', 'openapi', 'pets', 'listPets']);
  });

  it('encodes each segment the way the page slugs were encoded, and no further', () => {
    expect(slugsFromSplat('api/List All Pets')).to.deep.equal(['api', 'List%20All%20Pets']);
    expect(slugsFromSplat('café')).to.deep.equal(['caf%C3%A9']);
    // encodeURI, not encodeURIComponent: Fumadocs leaves these in, so matching them means leaving them too.
    expect(slugsFromSplat('pets&cats')).to.deep.equal(['pets&cats']);
  });
});

// A page whose slug needed encoding was reachable only by the URL Fumadocs prints, never by the
// decoded path the router hands back -- so the static build failed to prerender it and a reader
// following the sidebar got the not-found page.
describe('a page whose operationId needs encoding', () => {
  let directory: string;

  const urlOf = async () => {
    const source = loader(
      { openapi: await openApiSection('openapi', path.join(directory, 'api.json'), null) },
      {
        baseUrl: '/'
      }
    );
    const page = source.getPages().find((candidate) => candidate.url.includes('%20'));
    expect(page, 'no page slug needed encoding').to.not.equal(undefined);
    return { source, url: page!.url };
  };

  /** What TanStack gives a route: the pathname, already percent-decoded. */
  const splatOf = (url: string) => decodeURIComponent(url).replace(/^\//, '');

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'page-slugs-'));
    fs.writeFileSync(
      path.join(directory, 'api.json'),
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'Pets', version: '1' },
        tags: [{ name: 'pets' }],
        paths: { '/pets': { get: { operationId: 'List All Pets', tags: ['pets'], responses: ok } } }
      })
    );
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('is found from the splat the router decoded', async () => {
    const { source, url } = await urlOf();

    expect(source.getPage(slugsFromSplat(splatOf(url)))?.url).to.equal(url);
  });

  it('is found at its Markdown address too', async () => {
    const { source, url } = await urlOf();

    expect(source.getPage(decodeMarkdownUrl(slugsFromSplat(`${splatOf(url)}.md`)))?.url).to.equal(url);
  });

  it('is missed when the splat is looked up as it arrives', async () => {
    const { source, url } = await urlOf();

    expect(source.getPage(splatOf(url).split('/'))).to.equal(undefined);
  });
});
