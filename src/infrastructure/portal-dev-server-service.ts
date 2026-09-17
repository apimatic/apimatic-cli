import { Buffer } from 'node:buffer';
import { execa, ResultPromise } from 'execa';
import { err, ok, Result } from 'neverthrow';
import { UrlPath } from '../types/file/urlPath.js';
import { PortalProjectPaths, PortalProjectService } from './portal-project-service.js';

/** Cold starts spend most of this budget pre-bundling dependencies for the first time. */
const STARTUP_TIMEOUT_MS = 3 * 60 * 1000;

// Vite colourises this line and bolds the port inside the URL, so the colour codes have to
// come out before it reads as one address. The trailing newline proves the line is complete
// and not a half-delivered chunk.
const LOCAL_URL_PATTERN = /Local:\s*(https?:\/\/\S+?)\/?[ \t]*[\r\n]/i;

// Colour sequences only. `stripAnsi` in utils also drops newlines, which are exactly what
// marks the end of the line the URL is printed on. Built from a code point so the escape
// character never appears literally in this source.
const COLOUR_SEQUENCE_PATTERN = new RegExp(String.raw`${String.fromCodePoint(27)}\[[0-9;]*[a-zA-Z]`, 'g');

export interface PortalDevServer {
  url: UrlPath;
  /** Resolves once the server process has exited. */
  stop: () => Promise<void>;
}

export interface PortalDevServerFailure {
  message: string;
  log: string;
}

export class PortalDevServerService {
  private readonly projectService = new PortalProjectService();

  public async start(
    project: PortalProjectPaths,
    port: number
  ): Promise<Result<PortalDevServer, PortalDevServerFailure>> {
    // `--strictPort` makes Vite fail instead of silently moving to another port, so the
    // URL reported to the user is always the one that was reserved.
    const subprocess = execa(
      process.execPath,
      [project.viteBinary.toString(), 'dev', '--port', String(port), '--strictPort'],
      {
        cwd: project.projectDirectory.toString(),
        env: this.projectService.childEnvironment(),
        extendEnv: false,
        all: true,
        buffer: false,
        reject: false,
        // Vite's dev server ignores SIGTERM while it is optimizing dependencies.
        forceKillAfterDelay: 5000
      }
    );

    const started = await this.waitForUrl(subprocess);
    if (started.isErr()) {
      await this.terminate(subprocess);
      return err(started.error);
    }

    return ok({
      url: started.value,
      stop: () => this.terminate(subprocess)
    });
  }

  private waitForUrl(subprocess: ResultPromise): Promise<Result<UrlPath, PortalDevServerFailure>> {
    return new Promise((resolve) => {
      let log = '';
      let settled = false;

      const onData = (chunk: Buffer) => {
        log += chunk.toString().replace(COLOUR_SEQUENCE_PATTERN, '');
        const match = LOCAL_URL_PATTERN.exec(log);
        if (match) {
          settle(ok(new UrlPath(match[1])));
        }
      };

      const settle = (result: Result<UrlPath, PortalDevServerFailure>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // The server then runs until the user stops it; left attached, this would buffer
        // every line it prints for the whole session.
        subprocess.all?.off('data', onData);
        resolve(result);
      };

      const timer = setTimeout(() => {
        settle(err({ message: 'The portal preview did not start in time.', log }));
      }, STARTUP_TIMEOUT_MS);

      subprocess.all?.on('data', onData);

      // A failed port bind or a broken config exits before ever printing a URL.
      void subprocess.then(
        () => settle(err({ message: 'The portal preview stopped unexpectedly.', log })),
        () => settle(err({ message: 'The portal preview could not be started.', log }))
      );
    });
  }

  private async terminate(subprocess: ResultPromise): Promise<void> {
    subprocess.kill('SIGTERM');
    await subprocess.catch(() => undefined);
  }
}
