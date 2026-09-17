import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { PortalBuildService } from '../../src/infrastructure/portal-build-service';
import { PortalProjectService } from '../../src/infrastructure/portal-project-service';
import { PortalSourceContext } from '../../src/types/portal-source-context';
import { PortalContext } from '../../src/types/portal-context';
import { DirectoryPath } from '../../src/types/file/directoryPath';

// A real Vite build takes tens of seconds and needs every runtime dependency installed,
// so it stays out of the default run. CI switches it on for the platform matrix.
const enabled = process.env.APIMATIC_E2E === '1';

(enabled ? describe : describe.skip)('portal build (end to end)', function () {
  this.timeout(10 * 60 * 1000);

  const fixture = new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/default');

  let root: string;
  let output: DirectoryPath;

  before(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-e2e-'));

    // Drives the same path the command does: read the source directory, prepare the
    // project, build it, save it.
    const source = (await new PortalSourceContext(fixture).resolve())._unsafeUnwrap();

    const project = new DirectoryPath(root).join('build');
    fs.mkdirSync(project.toString(), { recursive: true });
    const prepared = (await new PortalProjectService().prepare(project, source))._unsafeUnwrap();

    const build = await new PortalBuildService().build(prepared);
    if (build.isErr()) {
      throw new Error(`${build.error.message}\n${build.error.log.split('\n').slice(-20).join('\n')}`);
    }
    expect(build.value.pageCount).to.be.greaterThan(1);

    output = new DirectoryPath(root).join('portal');
    await new PortalContext(output).save(build.value.output, false);
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const read = (relative: string) => fs.readFileSync(path.join(output.toString(), relative), 'utf8');
  const exists = (relative: string) => fs.existsSync(path.join(output.toString(), relative));

  it('writes a home page carrying the content page', () => {
    expect(exists('index.html')).to.be.true;
    expect(read('index.html')).to.contain('Hello from the fixture.');
  });

  it('writes a page per operation in the specification', () => {
    expect(exists('api/apimatic-calculator/simple-calculator/Calculate/index.html')).to.be.true;
  });

  it('ignores files in spec/ that are not specifications', () => {
    // APIMATIC-META.json sits beside the spec for SDK generation.
    expect(exists('api/apimatic-meta')).to.be.false;
  });

  it('copies the static directory to the site root', () => {
    expect(exists('images/logo.png')).to.be.true;
  });

  it('writes the not-found page static hosts serve for unknown paths', () => {
    expect(exists('404.html')).to.be.true;
  });

  it('writes the markdown companion the page actions fetch', () => {
    expect(read('index.md')).to.contain('Hello from the fixture.');
  });

  it('writes a search index and the llms files', () => {
    expect(exists('api/search')).to.be.true;
    expect(read('llms.txt')).to.contain('Welcome');
  });

  it('writes a sitemap and robots file naming the configured address', () => {
    expect(read('sitemap.xml')).to.contain('https://docs.test/api/apimatic-calculator/simple-calculator/Calculate');
    expect(read('robots.txt')).to.contain('Sitemap: https://docs.test/sitemap.xml');
  });

  it('marks each page canonical at its own address', () => {
    expect(read('index.html')).to.contain('<link rel="canonical" href="https://docs.test/"');
  });

  it('keeps the server-side specification loader out of the browser bundle', () => {
    // The loader reads the specification off disk. Shipped to the browser once, it threw
    // before React could hydrate and left every page of the portal inert.
    const scripts = fs.readdirSync(path.join(output.toString(), 'assets')).filter((name) => name.endsWith('.js'));
    const offenders = scripts.filter((name) => read('assets/' + name).includes('Failed to resolve input'));
    expect(offenders).to.deep.equal([]);
  });
});
