import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import getPort from 'get-port';
import { PortalDevServerService, PortalDevServer } from '../../src/infrastructure/portal-dev-server-service';
import { PortalProjectService } from '../../src/infrastructure/portal-project-service';
import { PortalSourceContext } from '../../src/types/portal-source-context';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FilePath } from '../../src/types/file/filePath';
import { CodeSampleCatalogs } from '../../src/types/portal/code-samples';
import { PortalArtifacts } from '../../src/types/portal/portal-artifacts';
import { canonical } from '../../src/infrastructure/tmp-extensions';
import { sleep } from '../../src/infrastructure/timer-extensions';

// Opt-in: a real dev server needs a minute and every runtime dependency.
const enabled = process.env.APIMATIC_E2E === '1';

(enabled ? describe : describe.skip)('portal serve (end to end)', function () {
  this.timeout(10 * 60 * 1000);

  const fixture = new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/default/src');
  const specFile = (source: DirectoryPath) => path.join(source.toString(), 'spec', 'Apimatic-Calculator.json');
  const reference = '/api/apimatic-calculator/simple-calculator/Calculate.md';
  const roots: string[] = [];
  const servers: PortalDevServer[] = [];

  /** A preview of `source`, its project in the temp directory, which on a CI runner is another drive than the checkout. */
  const startPreview = async (source: DirectoryPath) => {
    const root = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'portal-serve-e2e-')));
    roots.push(root);

    const resolved = (await new PortalSourceContext(source).resolve())._unsafeUnwrap();
    const delivered = path.join(root, 'delivered');
    fs.mkdirSync(delivered, { recursive: true });
    fs.writeFileSync(path.join(delivered, 'typescript.zip'), 'PK typescript');
    const artifacts = new PortalArtifacts(
      new CodeSampleCatalogs([]),
      new Map([['typescript', FilePath.create(path.join(delivered, 'typescript.zip'))!]]),
      new Map([['typescript', '## Installation\n\nInstall it.\n']]),
      undefined
    );
    expect(resolved.generatedPages.missingFrom(artifacts), 'the artifacts back every page').to.be.null;

    const project = new DirectoryPath(root).join('build');
    fs.mkdirSync(project.toString(), { recursive: true });
    const prepared = (await new PortalProjectService().prepare(project, resolved, artifacts))._unsafeUnwrap();

    const started = await new PortalDevServerService().start(prepared, await getPort());
    if (started.isErr()) {
      throw new Error(`${started.error.message}\n${started.error.log.split('\n').slice(-20).join('\n')}`);
    }
    servers.push(started.value);
    return { project, server: started.value };
  };

  /**
   * A copy of the fixture as `edit` leaves it, for a test that edits what its preview reads, reached through a link
   * to it, as a user's folder may be and macOS's temp directory is.
   */
  const linkedCopy = (edit: (source: DirectoryPath) => void = () => undefined): DirectoryPath => {
    const root = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'portal-serve-source-')));
    roots.push(root);
    const copy = path.join(root, 'copy');
    fs.cpSync(fixture.toString(), copy, { recursive: true });
    edit(new DirectoryPath(copy));
    fs.symlinkSync(copy, path.join(root, 'src'), 'junction');
    return new DirectoryPath(root).join('src');
  };

  let checkout: { project: DirectoryPath; server: PortalDevServer };
  let linked: { source: DirectoryPath; server: PortalDevServer };

  before(async () => {
    checkout = await startPreview(fixture);
    const source = linkedCopy();
    linked = { source, server: (await startPreview(source)).server };
  });

  after(async () => {
    for (const server of servers) await server.stop();
    roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  // Under `vite dev` a page that is not there is answered 200 too, so a Markdown twin is told by its type.
  const servesMarkdown = async (from: PortalDevServer, address: string): Promise<boolean> => {
    const response = await globalThis.fetch(`${from.url.toString()}${address}`);
    await response.arrayBuffer();
    return response.ok && (response.headers.get('content-type') ?? '').startsWith('text/markdown');
  };

  // The preview reloads a saved specification in its own time.
  const servesMarkdownOnceIt = async (from: PortalDevServer, address: string, expected: boolean): Promise<boolean> => {
    const deadline = Date.now() + 60 * 1000;
    let served = await servesMarkdown(from, address);
    while (served !== expected && Date.now() < deadline) {
      await sleep(250);
      served = await servesMarkdown(from, address);
    }
    return served;
  };

  // A missing file answers 200 too, with the fallback page, so the type says what came back.
  it('serves a dependency file asked for before its importer (apimatic-io#2287)', async () => {
    const installed = fs.realpathSync(
      path.join(checkout.project.toString(), 'node_modules', '@tanstack', 'react-start')
    );
    const entry = path.join(installed, 'dist', 'plugin', 'default-entry', 'client.tsx').split(path.sep).join('/');

    const response = await globalThis.fetch(`${checkout.server.url.toString()}/@fs/${entry}`);

    expect(response.status, await response.clone().text()).to.equal(200);
    expect(response.headers.get('content-type')).to.contain('javascript');
  });

  // The image comes from the static directory by its address, which Vite serves from any drive.
  const sources: [string, () => { source: DirectoryPath; server: PortalDevServer }][] = [
    ['the checkout', () => ({ source: fixture, server: checkout.server })],
    ['a folder reached through a link', () => linked]
  ];

  sources.forEach(([label, preview]) => {
    it(`serves a page's static image at its public address, its module asked for before the page, from ${label}`, async () => {
      const { source, server } = preview();
      const image = fs
        .realpathSync(path.join(source.toString(), 'static', 'images', 'logo.png'))
        .split(path.sep)
        .join('/');

      const module = await globalThis.fetch(`${server.url.toString()}/@fs/${image}?import`);
      const response = await globalThis.fetch(`${server.url.toString()}/images/logo.png`);

      expect(await module.text()).to.contain('export default "/images/logo.png"');
      expect(response.status).to.equal(200);
      expect(response.headers.get('content-type')).to.equal('image/png');
    });
  });

  // The dev server names a module by its real path, which its allow list has to name too (apimatic-io#2287).
  it('serves a static file by its real path when its folder is reached through a link', async () => {
    const image = fs
      .realpathSync(path.join(linked.source.toString(), 'static', 'images', 'logo.png'))
      .split(path.sep)
      .join('/');

    const response = await globalThis.fetch(`${linked.server.url.toString()}/@fs/${image}`);

    expect(response.status).to.equal(200);
    expect(response.headers.get('content-type')).to.equal('image/png');
  });

  it('leaves out the reference of a specification saved half written, serving the rest, until it is fixed', async () => {
    const { source, server } = linked;
    const spec = specFile(source);
    const written = fs.readFileSync(spec, 'utf8');
    expect(await servesMarkdown(server, reference), 'the reference before the save').to.be.true;

    fs.writeFileSync(spec, written.slice(0, written.length / 2));
    try {
      expect(await servesMarkdownOnceIt(server, reference, false), 'the reference while broken').to.be.false;
      expect(await servesMarkdown(server, '/authentication.md'), 'a Markdown page while broken').to.be.true;
    } finally {
      fs.writeFileSync(spec, written);
    }

    expect(await servesMarkdownOnceIt(server, reference, true), 'the reference once fixed').to.be.true;
  });

  // A `$ref` below an `$id` is resolved against the `$id`, so the check leaves it to the bundler, which fails on it.
  it('starts with a specification the bundler fails on, serving the rest without its reference', async () => {
    const source = linkedCopy((copy) => {
      const document = JSON.parse(fs.readFileSync(specFile(copy), 'utf8'));
      document.components.schemas.Tagged = { $id: 'tagged.json', properties: { tag: { $ref: './tag.yaml' } } };
      fs.writeFileSync(specFile(copy), JSON.stringify(document));
    });
    const { server } = await startPreview(source);

    expect(await servesMarkdown(server, '/authentication.md'), 'a Markdown page').to.be.true;
    expect(await servesMarkdown(server, reference), 'the reference').to.be.false;
  });
});
