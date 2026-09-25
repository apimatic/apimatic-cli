import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { expect } from 'chai';
import type { ViteDevServer } from 'vite';
import { downloads } from '../../portal-template/downloads';

type Middleware = (request: { url: string }, response: PassThrough, next: () => void) => void;

describe('downloads', () => {
  let root: string;
  let directory: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-downloads-'));
    directory = path.join(root, 'downloads');
    fs.mkdirSync(path.join(directory, 'sdk'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'sdk', 'python.zip'), 'PK python');
    fs.writeFileSync(path.join(directory, 'plugin.zip'), 'PK plugin');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('in the preview', () => {
    const middlewareFor = async (downloadsDirectory: string | null): Promise<Middleware | undefined> => {
      let middleware: Middleware | undefined;
      const server = { middlewares: { use: (handler: Middleware) => (middleware = handler) } };
      const configureServer = downloads(downloadsDirectory).configureServer as (server: ViteDevServer) => Promise<void>;
      await configureServer(server as unknown as ViteDevServer);
      return middleware;
    };

    /** The body served for `url`, or `undefined` when the request is passed on. */
    const request = async (url: string): Promise<string | undefined> => {
      const middleware = (await middlewareFor(directory))!;
      const response = Object.assign(new PassThrough(), { setHeader: () => {} });
      let passedOn = false;
      middleware({ url }, response, () => (passedOn = true));
      if (passedOn) return undefined;
      const chunks: Buffer[] = [];
      for await (const chunk of response) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString('utf8');
    };

    it('serves each download under /__downloads/', async () => {
      expect(await request('/__downloads/sdk/python.zip')).to.equal('PK python');
      expect(await request('/__downloads/plugin.zip?v=1')).to.equal('PK plugin');
    });

    // The user's static directory answers these, and the pages behind them.
    it('passes on every other address, including the same file outside the prefix', async () => {
      expect(await request('/sdk/python.zip')).to.be.undefined;
      expect(await request('/__downloads/sdk/java.zip')).to.be.undefined;
      expect(await request('/__downloads/../plugin.zip')).to.be.undefined;
    });

    it('adds nothing when the run carried no downloads', async () => {
      expect(await middlewareFor(null)).to.be.undefined;
    });
  });

  describe('in the build', () => {
    const writeBundle = async (environment: string, downloadsDirectory: string | null, dir: string) => {
      const hook = downloads(downloadsDirectory).writeBundle as (
        this: { environment: { name: string } },
        options: { dir: string }
      ) => Promise<void>;
      await hook.call({ environment: { name: environment } }, { dir });
    };

    it('copies the downloads under __downloads/ in the site the browser is served', async () => {
      const output = path.join(root, 'client');

      await writeBundle('client', directory, output);

      expect(fs.readFileSync(path.join(output, '__downloads', 'sdk', 'python.zip'), 'utf8')).to.equal('PK python');
      expect(fs.readFileSync(path.join(output, '__downloads', 'plugin.zip'), 'utf8')).to.equal('PK plugin');
    });

    it('leaves the server bundle, and a run without downloads, alone', async () => {
      const output = path.join(root, 'server');

      await writeBundle('ssr', directory, output);
      await writeBundle('client', null, output);

      expect(fs.existsSync(output)).to.be.false;
    });
  });
});
