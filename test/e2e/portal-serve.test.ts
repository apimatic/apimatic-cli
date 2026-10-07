import fs from 'fs';
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
import {
  ensurePortalProjectDirectoryBase,
  removePortalProjectDirectoryBase
} from '../../src/infrastructure/tmp-extensions';
import { sleep } from '../../src/infrastructure/timer-extensions';

// A real Vite dev server takes a minute to compile the portal and needs every runtime
// dependency installed, so it stays out of the default run, as the build test does.
const enabled = process.env.APIMATIC_E2E === '1';

(enabled ? describe : describe.skip)('portal serve (end to end)', function () {
  this.timeout(10 * 60 * 1000);

  const fixture = new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/default/src');
  let base: string;
  let root: string;
  let sourceDirectory: DirectoryPath;
  let server: PortalDevServer | undefined;

  before(async () => {
    base = await ensurePortalProjectDirectoryBase(fixture);
    root = fs.mkdtempSync(path.join(base, 'portal-serve-e2e-'));
    // A copy, since a test edits the source while the preview reads it.
    sourceDirectory = new DirectoryPath(root).join('src');
    fs.cpSync(fixture.toString(), sourceDirectory.toString(), { recursive: true });

    const source = (await new PortalSourceContext(sourceDirectory).resolve())._unsafeUnwrap();
    const delivered = path.join(root, 'delivered');
    fs.mkdirSync(delivered, { recursive: true });
    fs.writeFileSync(path.join(delivered, 'typescript.zip'), 'PK typescript');
    const artifacts = new PortalArtifacts(
      new CodeSampleCatalogs([]),
      new Map([['typescript', FilePath.create(path.join(delivered, 'typescript.zip'))!]]),
      new Map([['typescript', '## Installation\n\nInstall it.\n']]),
      undefined
    );
    expect(source.generatedPages.missingFrom(artifacts), 'the artifacts back every page').to.be.null;

    const project = new DirectoryPath(root).join('build');
    fs.mkdirSync(project.toString(), { recursive: true });
    const prepared = (await new PortalProjectService().prepare(project, source, artifacts))._unsafeUnwrap();

    const started = await new PortalDevServerService().start(prepared, await getPort());
    if (started.isErr()) {
      throw new Error(`${started.error.message}\n${started.error.log.split('\n').slice(-20).join('\n')}`);
    }
    server = started.value;
  });

  after(async () => {
    await server?.stop();
    fs.rmSync(root, { recursive: true, force: true });
    await removePortalProjectDirectoryBase(base);
  });

  // Under `vite dev` a page that is not there is answered 200 too, so a Markdown twin is told by its type.
  const servesMarkdown = async (address: string): Promise<boolean> => {
    const response = await globalThis.fetch(`${server?.url.toString()}${address}`);
    await response.arrayBuffer();
    return response.ok && (response.headers.get('content-type') ?? '').startsWith('text/markdown');
  };

  // The preview reloads a saved specification in its own time.
  const servesMarkdownOnceIt = async (address: string, expected: boolean): Promise<boolean> => {
    const deadline = Date.now() + 60 * 1000;
    let served = await servesMarkdown(address);
    while (served !== expected && Date.now() < deadline) {
      await sleep(250);
      served = await servesMarkdown(address);
    }
    return served;
  };

  /**
   * Safari keeps the entry module cached across previews on the fixed port and executes it
   * without asking the fresh server, so its first request is the file the entry imports from
   * the CLI's installation. Served only through its importer's transform, that first request
   * is refused as outside the allow list, and the page stays blank (apimatic-io#2287).
   */
  it('serves the TanStack dev entry to a browser that asks for it before anything else', async () => {
    const installed = fs.realpathSync(path.join(root, 'build', 'node_modules', '@tanstack', 'react-start'));
    const entry = path.join(installed, 'dist', 'plugin', 'default-entry', 'client.tsx').split(path.sep).join('/');

    const response = await globalThis.fetch(`${server?.url.toString()}/@fs/${entry}`);

    expect(response.status, await response.text()).to.equal(200);
  });

  // A page imports its images from the static directory, outside the project, by the same kind of address.
  it('serves an image from the static directory to a browser that asks for it before the page', async () => {
    const image = fs
      .realpathSync(path.join(sourceDirectory.toString(), 'static', 'images', 'logo.png'))
      .split(path.sep)
      .join('/');

    const response = await globalThis.fetch(`${server?.url.toString()}/@fs/${image}`);

    expect(response.status).to.equal(200);
  });

  it('leaves out the reference of a specification saved half written, serving the rest, until it is fixed', async () => {
    const spec = path.join(sourceDirectory.toString(), 'spec', 'Apimatic-Calculator.json');
    const written = fs.readFileSync(spec, 'utf8');
    const reference = '/api/apimatic-calculator/simple-calculator/Calculate.md';
    expect(await servesMarkdown(reference), 'the reference before the save').to.be.true;

    fs.writeFileSync(spec, written.slice(0, written.length / 2));
    try {
      expect(await servesMarkdownOnceIt(reference, false), 'the reference while broken').to.be.false;
      expect(await servesMarkdown('/authentication.md'), 'a Markdown page while broken').to.be.true;
    } finally {
      fs.writeFileSync(spec, written);
    }

    expect(await servesMarkdownOnceIt(reference, true), 'the reference once fixed').to.be.true;
  });
});
