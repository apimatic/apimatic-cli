import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { loader } from 'fumadocs-core/source';
import { openApiSection } from '../../portal-template/src/lib/openapi-section.server';
import { decodeMarkdownUrl, encodeSlugs } from '../../portal-template/src/lib/shared';

const ok = { 200: { description: 'ok' } };

describe('encodeSlugs', () => {
  it('leaves an ordinary slug exactly as it was', () => {
    expect(encodeSlugs(['api', 'openapi', 'pets', 'listPets'])).to.deep.equal(['api', 'openapi', 'pets', 'listPets']);
  });

  it('encodes each segment the way the page slugs were encoded, and no further', () => {
    expect(encodeSlugs(['api', 'List All Pets'])).to.deep.equal(['api', 'List%20All%20Pets']);
    expect(encodeSlugs(['café'])).to.deep.equal(['caf%C3%A9']);
    expect(encodeSlugs(['pets&cats'])).to.deep.equal(['pets&cats']);
  });
});

describe('a page whose operationId needs encoding', () => {
  let directory: string;
  let source: Awaited<ReturnType<typeof sectionSource>>;
  let url: string;

  const sectionSource = async () =>
    loader({ openapi: await openApiSection('openapi', path.join(directory, 'api.json'), null) }, { baseUrl: '/' });

  const decodedSplatOf = (pageUrl: string) => decodeURIComponent(pageUrl).replace(/^\//, '');

  before(async () => {
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

    source = await sectionSource();
    const page = source.getPages().find((candidate) => candidate.url.includes('%20'));
    expect(page, 'no page slug needed encoding').to.not.equal(undefined);
    url = page!.url;
  });

  after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('is found from the splat the router decoded', () => {
    expect(source.getPage(encodeSlugs(decodedSplatOf(url).split('/')))?.url).to.equal(url);
  });

  it('is found at its Markdown address too', () => {
    expect(source.getPage(decodeMarkdownUrl(encodeSlugs(decodedSplatOf(url).split('/'))))?.url).to.equal(url);
  });

  it('is missed when the splat is looked up as it arrives', () => {
    expect(source.getPage(decodedSplatOf(url).split('/'))).to.equal(undefined);
  });
});
