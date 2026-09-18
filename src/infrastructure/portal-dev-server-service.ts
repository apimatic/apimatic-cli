import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';
import { execa, ResultPromise } from 'execa';
import { err, ok, Result } from 'neverthrow';
import { UrlPath } from '../types/file/urlPath.js';
import { PortalProjectPaths, PortalProjectService } from './portal-project-service.js';

/** Cold starts spend most of this budget pre-bundling dependencies for the first time. */
const STARTUP_TIMEOUT_MS = 3 * 60 * 1000;

/** How much of a running server's output is kept, in case it is the explanation of a crash. */
const OUTPUT_TAIL_CHUNKS = 64;

/** How long the last of a dead server's output is waited for before reporting what arrived. */
const DRAIN_TIMEOUT_MS = 2000;

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
  /**
   * Resolves with what the server printed after startup if it stops on its own. Without it
   * the CLI kept advertising an address nothing was listening on, and then fell off the
   * event loop and exited with Node's own code for an unsettled top-level await.
   */
  exited: Promise<string>;
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
      exited: this.watchForExit(subprocess),
      stop: () => this.terminate(subprocess)
    });
  }

  /**
   * Keeps reading the server's output after startup. Detaching instead left the pipe to fill
   * and block the server once it had printed enough, and threw away the very output that
   * explains a crash; only the tail is kept, so a long session cannot grow without bound.
   */
  private watchForExit(subprocess: ResultPromise): Promise<string> {
    const tail: string[] = [];
    const output = subprocess.all;
    output?.on('data', (chunk: Buffer) => {
      tail.push(chunk.toString().replace(COLOUR_SEQUENCE_PATTERN, ''));
      if (tail.length > OUTPUT_TAIL_CHUNKS) {
        tail.shift();
      }
    });

    // The process resolves before the last of its output has been delivered, so waiting only
    // on that loses the very lines that explain the exit. Bounded, because a stream that
    // never ends must not leave the CLI waiting for one.
    const drained = new Promise<void>((resolve) => {
      if (!output) {
        resolve();
        return;
      }
      output.once('end', resolve);
      output.once('close', resolve);
      output.once('error', resolve);
    });

    const collect = async (): Promise<string> => {
      await Promise.race([drained, delay(DRAIN_TIMEOUT_MS)]);
      return tail.join('');
    };
    return subprocess.then(collect, collect);
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
