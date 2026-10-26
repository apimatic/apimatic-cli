import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { expect } from 'chai';
import type { Plugin } from 'vite';
import { CACHE_ADDRESS, staticFunctionsBase } from '../../portal-template/static-functions-base';

interface Transform {
  filter: { id: RegExp; code: string };
  handler: (code: string) => string;
}

const MODULE =
  '/p/node_modules/.pnpm/x/node_modules/@tanstack/start-static-server-functions/dist/esm/staticFunctionMiddleware.js';
const SOURCE = 'return `/__tsr/staticServerFnCache/${filename}.json`;';

/** The plugin as the build of a portal served under `base` resolves it. */
function pluginFor(base: string): Plugin {
  const plugin = staticFunctionsBase();
  (plugin.configResolved as (config: { base: string }) => void)({ base });
  return plugin;
}

const transform = (plugin: Plugin) => plugin.transform as unknown as Transform;

/** What the plugin reports when the build ends, having failed with `error` or not. */
function reportAtEnd(plugin: Plugin, error?: Error): string | undefined {
  let reported: string | undefined;
  const buildEnd = plugin.buildEnd as (this: { error: (message: string) => void }, error?: Error) => void;
  buildEnd.call({ error: (message) => (reported = message) }, error);
  return reported;
}

describe('staticFunctionsBase', () => {
  // The server's copy writes the files, joining the address onto the output directory.
  it('changes the browser build alone', () => {
    const plugin = staticFunctionsBase();
    const appliesTo = plugin.applyToEnvironment as (environment: { name: string }) => boolean;

    expect(plugin.apply).to.equal('build');
    expect(appliesTo({ name: 'client' })).to.be.true;
    expect(appliesTo({ name: 'ssr' })).to.be.false;
  });

  it('puts the address cached results are fetched from under the base', () => {
    expect(transform(pluginFor('/api/')).handler(SOURCE)).to.equal(
      'return `/api/__tsr/staticServerFnCache/${filename}.json`;'
    );
  });

  it('leaves the address as it is at the root, and still counts it found', () => {
    const plugin = pluginFor('/');

    expect(transform(plugin).handler(SOURCE)).to.equal(SOURCE);
    expect(reportAtEnd(plugin)).to.be.undefined;
  });

  it('looks only at modules of that package holding the address', () => {
    const { filter } = transform(staticFunctionsBase());

    expect(filter.id.test(MODULE)).to.be.true;
    expect(filter.id.test('C:\\p\\node_modules\\@tanstack\\start-static-server-functions\\dist\\esm\\x.js')).to.be.true;
    expect(filter.id.test('/p/src/lib/cache.ts')).to.be.false;
    expect(filter.code).to.equal(CACHE_ADDRESS);
  });

  it('fails the build when no module held the address, naming the package', () => {
    expect(reportAtEnd(pluginFor('/api/'))).to.contain('@tanstack/start-static-server-functions');
  });

  it('adds nothing to a build that has already failed', () => {
    expect(reportAtEnd(pluginFor('/api/'), new Error('earlier'))).to.be.undefined;
  });

  // Read from the installed package, so an upgrade that moves the address fails here, not only in a build.
  it('finds the address in the installed package, where the filter looks', () => {
    const require = createRequire(import.meta.url);
    const dist = path.join(
      path.dirname(require.resolve('@tanstack/start-static-server-functions/package.json')),
      'dist'
    );
    const holding = fs
      .readdirSync(dist, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.js'))
      .map((file) => path.join(dist, file))
      .filter((file) => fs.readFileSync(file, 'utf8').includes(CACHE_ADDRESS));

    expect(holding).to.not.be.empty;
    expect(holding.filter((file) => !transform(staticFunctionsBase()).filter.id.test(file))).to.deep.equal([]);
  });
});
