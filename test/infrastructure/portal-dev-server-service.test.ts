import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import getPort from 'get-port';
import { PortalDevServerService } from '../../src/infrastructure/portal-dev-server-service';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';

// `start` runs `process.execPath <viteBinary> dev --port <n> --strictPort`, so a plain script
// standing in for Vite exercises the whole of it without a build.
describe('PortalDevServerService', () => {
  let root: string;
  let port: number;

  const script = (body: string): FilePath => {
    const name = 'fake-vite.js';
    fs.writeFileSync(path.join(root, name), body);
    return new FilePath(new DirectoryPath(root), new FileName(name));
  };

  // Stands in for Vite, which listens before printing its address, and ends itself if a failing test never stops it.
  const serving = (answer: string, line = `  Local:   http://127.0.0.1:${port}/`) =>
    `const server = require('http').createServer((request, response) => { ${answer} });\n` +
    `server.listen(${port}, '127.0.0.1', () => process.stdout.write('${line}\\n'));\n` +
    `setTimeout(() => process.exit(), 60000).unref();\n`;

  const start = (viteBinary: FilePath) =>
    new PortalDevServerService().start(
      { projectDirectory: new DirectoryPath(root), viteBinary, contentSource: null },
      port
    );

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-server-'));
    port = await getPort();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports the address the server prints, with the colour codes removed', async () => {
    const binary = script(
      serving(
        `response.end('page');`,
        `  \\u001b[32m\\u001b[1mLocal\\u001b[22m\\u001b[39m:   \\u001b[36mhttp://127.0.0.1:${port}/\\u001b[39m`
      )
    );

    const started = await start(binary);

    expect(started.isOk(), JSON.stringify(started.isErr() ? started.error : '')).to.be.true;
    const server = started._unsafeUnwrap();
    expect(server.url.toString()).to.equal(`http://127.0.0.1:${port}`);
    await server.stop();
  });

  // Vite serves a portal mounted under a path at the trailing slash and 404s the address
  // without it, so dropping the slash would advertise -- and `--open` would open -- a 404.
  it('keeps the trailing slash of an address that carries a path', async () => {
    const binary = script(
      serving(`response.end('page');`, `  Local:   http://127.0.0.1:${port}/docs/`)
    );

    const started = await start(binary);

    expect(started.isOk(), JSON.stringify(started.isErr() ? started.error : '')).to.be.true;
    const server = started._unsafeUnwrap();
    expect(server.url.toString()).to.equal(`http://127.0.0.1:${port}/docs/`);
    await server.stop();
  });

  it('reports the server started only once it has answered its first page', async () => {
    const binary = script(serving(`require('fs').writeFileSync('answered', ''); response.end('page');`));

    const server = (await start(binary))._unsafeUnwrap();
    const answered = fs.existsSync(path.join(root, 'answered'));
    await server.stop();

    expect(answered).to.be.true;
  });

  it('reports a server that crashes on its first page with what it printed after its address', async () => {
    const binary = script(
      serving(
        `process.stderr.write('the server fell over\\n'); process.exitCode = 1; ` +
          `server.close(); request.socket.destroy();`
      )
    );

    const started = await start(binary);

    expect(started.isErr()).to.be.true;
    const { log } = started._unsafeUnwrapErr();
    expect(log).to.contain('the server fell over');
    expect(log).to.not.contain('Local:');
  });

  it('stops a server that drops its first request rather than leaving it running', async () => {
    const binary = script(serving(`request.socket.destroy();`));

    const started = await start(binary);
    const released = await new Promise<boolean>((resolve) => {
      const probe = net.createServer().once('error', () => resolve(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });

    expect(started.isErr()).to.be.true;
    expect(released, 'the port is still held').to.be.true;
  });

  it('resolves `exited` with what the server printed when it stops on its own', async () => {
    const binary = script(
      serving(
        `response.end('page', () => setTimeout(() => { ` +
          `process.stdout.write('the server fell over\\n'); server.close(); process.exitCode = 1; }, 150));`
      )
    );

    const server = (await start(binary))._unsafeUnwrap();
    const output = await server.exited;

    expect(output).to.contain('the server fell over');
  });

  it('keeps reading output after startup rather than letting the pipe fill', async () => {
    // A server that prints far more than a pipe buffer holds would block if nothing drained it.
    // No process.exit(): on POSIX a pipe is written asynchronously and exiting discards
    // whatever is still queued, which would truncate the child rather than test the reader.
    const binary = script(
      serving(
        `response.end('page', () => { ` +
          `for (let i = 0; i < 20000; i += 1) process.stdout.write('noisy line ' + i + '\\n'); ` +
          `process.stdout.write('reached the end\\n'); server.close(); });`
      )
    );

    const server = (await start(binary))._unsafeUnwrap();
    const output = await server.exited;

    expect(output).to.contain('reached the end');
    expect(output).to.not.contain('noisy line 0\n');
    expect(output.length).to.be.lessThan(150_000);
  });

  it('reports a server that exits before printing an address', async () => {
    const binary = script(`process.stderr.write('Error: Port ${port} is already in use\\n'); process.exitCode = 1;\n`);

    const started = await start(binary);

    expect(started.isErr()).to.be.true;
    expect(started._unsafeUnwrapErr().log).to.contain('already in use');
  });
});
