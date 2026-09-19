import { Buffer } from 'node:buffer';
import { sleep } from './timer-extensions.js';
import { execa, ResultPromise } from 'execa';
import { err, ok, Result } from 'neverthrow';
import { UrlPath } from '../types/file/urlPath.js';
import { PortalProjectPaths, PortalProjectService } from './portal-project-service.js';

/** Cold starts spend most of this budget pre-bundling dependencies for the first time. */
const STARTUP_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * How much of a running server's output is kept, in case it is the explanation of a crash.
 * Counted in characters rather than chunks: a chunk is however much the pipe delivered at
 * once, which differs by platform and by Node version, so a bound of 64 chunks came to 4 KB
 * on one runner and 280 KB on another for the same output.
 */
const OUTPUT_TAIL_BYTES = 64 * 1024;

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
      // Bound explicitly to the IPv4 loopback. Left to itself the server listens on `::1`
      // only, while printing `localhost`, so wherever that name resolves to 127.0.0.1 --
      // IPv6 disabled, a hosts entry, some container images -- the address the CLI reports
      // and opens refuses the connection although the preview is healthy.
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
   * Keeps reading the server's output after startup. Detaching instead left the pipe to fill
   * and block the server once it had printed enough, and threw away the very output that
   * explains a crash; only the tail is kept, so a long session cannot grow without bound.
   */
  private watchForExit(subprocess: ResultPromise): Promise<string> {
    const tail: string[] = [];
    let kept = 0;
    const output = subprocess.all;
    output?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().replace(COLOUR_SEQUENCE_PATTERN, '');
      tail.push(text);
      kept += text.length;
      // The last chunk always survives, however big it is: it is the one most likely to hold
      // the message that explains the exit.
      while (tail.length > 1 && kept > OUTPUT_TAIL_BYTES) {
        kept -= (tail.shift() as string).length;
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
      // Cancelled once the output has arrived: `Promise.race` settles on the winner but
      // leaves the loser running, and a pending timer holds the event loop open. Nothing in
      // the CLI calls process.exit(), so the whole of `portal serve` used to sit for another
      // two seconds after Ctrl+C with nothing left to do.
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
