import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { PortalDevServerService } from '../../src/infrastructure/portal-dev-server-service';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';

// `start` runs `process.execPath <viteBinary> dev --port <n> --strictPort`, so a plain script
// standing in for Vite exercises the whole of it without a build.
describe('PortalDevServerService', () => {
  let root: string;

  const script = (body: string): FilePath => {
    const name = 'fake-vite.js';
    fs.writeFileSync(path.join(root, name), body);
    return new FilePath(new DirectoryPath(root), new FileName(name));
  };

  const project = (viteBinary: FilePath) => ({ projectDirectory: new DirectoryPath(root), viteBinary });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-server-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports the address the server prints, with the colour codes removed', async () => {
    const binary = script(
      `process.stdout.write('  \\u001b[32m\\u001b[1mLocal\\u001b[22m\\u001b[39m:   \\u001b[36mhttp://localhost:4321/\\u001b[39m\\n');\n` +
        `setTimeout(() => {}, 60000);\n`
    );

    const started = await new PortalDevServerService().start(project(binary), 4321);

    expect(started.isOk(), JSON.stringify(started.isErr() ? started.error : '')).to.be.true;
    const server = started._unsafeUnwrap();
    expect(server.url.toString()).to.equal('http://localhost:4321');
    await server.stop();
  });

  it('resolves `exited` with what the server printed when it stops on its own', async () => {
    const binary = script(
      `process.stdout.write('  Local:   http://localhost:4322/\\n');\n` +
        `setTimeout(() => { process.stdout.write('the server fell over\\n'); process.exitCode = 1; }, 150);\n`
    );

    const server = (await new PortalDevServerService().start(project(binary), 4322))._unsafeUnwrap();
    const output = await server.exited;

    expect(output).to.contain('the server fell over');
  });

  it('keeps reading output after startup rather than letting the pipe fill', async () => {
    // A server that prints far more than a pipe buffer holds would block if nothing drained it.
    // No process.exit(): on POSIX a pipe is written asynchronously and exiting discards
    // whatever is still queued, which would truncate the child rather than test the reader.
    const binary = script(
      `process.stdout.write('  Local:   http://localhost:4323/\\n');\n` +
        `for (let i = 0; i < 20000; i += 1) process.stdout.write('noisy line ' + i + '\\n');\n` +
        `process.stdout.write('reached the end\\n');\n`
    );

    const server = (await new PortalDevServerService().start(project(binary), 4323))._unsafeUnwrap();
    const output = await server.exited;

    expect(output).to.contain('reached the end');
    expect(output).to.not.contain('noisy line 0\n');
    expect(output.length).to.be.lessThan(150_000);
  });

  it('reports a server that exits before printing an address', async () => {
    const binary = script(`process.stderr.write('Error: Port 4324 is already in use\\n'); process.exitCode = 1;\n`);

    const started = await new PortalDevServerService().start(project(binary), 4324);

    expect(started.isErr()).to.be.true;
    expect(started._unsafeUnwrapErr().log).to.contain('already in use');
  });
});
