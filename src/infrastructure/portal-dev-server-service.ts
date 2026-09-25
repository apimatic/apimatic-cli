import { Buffer } from 'node:buffer';
import { stripVTControlCharacters } from 'node:util';
import { sleep } from './timer-extensions.js';
import { execa, ResultPromise } from 'execa';
import { err, ok, Result } from 'neverthrow';
import { UrlPath } from '../types/file/urlPath.js';
import { PortalProjectPaths, PortalProjectService } from './portal-project-service.js';

/** Cold starts spend most of this budget pre-bundling dependencies for the first time. */
const STARTUP_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * How much of a running server's output is kept, in case it explains a crash. Counted in
 * characters, not chunks: chunk size varies by platform and Node version, so the same output
 * bounded at 64 chunks came to 4 KB on one runner and 280 KB on another.
 */
const OUTPUT_TAIL_BYTES = 64 * 1024;

/** How long the last of a dead server's output is waited for before reporting what arrived. */
const DRAIN_TIMEOUT_MS = 2000;

// Read after Vite's colour codes are stripped but not the line end, which proves the URL arrived whole.
const LOCAL_URL_PATTERN = /Local:\s*(https?:\/\/\S+?)\/?[ \t]*[\r\n]/i;

export interface PortalDevServer {
  url: UrlPath;
  /**
   * Resolves with what the server printed after startup if it stops on its own, so the CLI
   * stops advertising an address nothing is listening on.
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
      // Bound explicitly to the IPv4 loopback. Left to itself the server listens on `::1`
      // only while printing `localhost`, so wherever that name resolves to 127.0.0.1 the
      // address the CLI reports refuses the connection although the preview is healthy.
      [project.viteBinary.toString(), 'dev', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
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
   * Keeps reading the server's output after startup: detaching lets the pipe fill and block
   * the server once it has printed enough. Only the tail is kept, so a long session is bounded.
   */
  private watchForExit(subprocess: ResultPromise): Promise<string> {
    const tail: string[] = [];
    let kept = 0;
    const output = subprocess.all;
    output?.on('data', (chunk: Buffer) => {
      const text = stripVTControlCharacters(chunk.toString());
      tail.push(text);
      kept += text.length;
      // The last chunk always survives, however big: it most likely holds the exit message.
      while (tail.length > 1 && kept > OUTPUT_TAIL_BYTES) {
        kept -= (tail.shift() as string).length;
      }
    });

    // The process resolves before the last of its output is delivered, so waiting only on
    // that loses the lines explaining the exit. Bounded, in case the stream never ends.
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
      // Cancelled once the output has arrived: `Promise.race` leaves the loser running, and
      // a pending timer holds the event loop open. Nothing here calls process.exit(), so the
      // timer alone kept `portal serve` alive for two seconds after Ctrl+C.
      const expiry = new AbortController();
      try {
        await Promise.race([drained, sleep(DRAIN_TIMEOUT_MS, expiry.signal)]);
      } finally {
        expiry.abort();
      }
      return tail.join('');
    };
    return subprocess.then(collect, collect);
  }

  private waitForUrl(subprocess: ResultPromise): Promise<Result<UrlPath, PortalDevServerFailure>> {
    return new Promise((resolve) => {
      let log = '';
      let settled = false;

      const onData = (chunk: Buffer) => {
        log += stripVTControlCharacters(chunk.toString());
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
