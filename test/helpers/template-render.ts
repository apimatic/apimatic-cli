import { createServer, type Plugin, type ViteDevServer } from 'vite';

const ENTRY = 'virtual:template-fixture';

/** A module the server loads in place of any one `replaces` picks. */
export interface StandIn {
  replaces: (id: string, importer: string | undefined) => boolean;
  source: string;
}

interface Options {
  standIns?: StandIn[];
  /** Packages Vite bundles instead of leaving to Node, so it defines `import.meta.env` for them too. */
  bundled?: string[];
}

/**
 * The `render` that `fixture` exports, loaded by a Vite server as a portal built under `base` loads the template.
 * The server starts before the block's cases and closes after them.
 */
export function renderedUnder<Args extends unknown[]>(
  base: string,
  fixture: string,
  { standIns = [], bundled = [] }: Options = {}
): (...args: Args) => string {
  let server: ViteDevServer;
  let render: (...args: Args) => string;

  before(async () => {
    server = await createServer({
      configFile: false,
      root: process.cwd(),
      base,
      resolve: { tsconfigPaths: true },
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
      ssr: { noExternal: bundled },
      plugins: [templateFixture(fixture, standIns)]
    });
    ({ render } = (await server.ssrLoadModule(ENTRY)) as { render: typeof render });
  });

  after(() => server.close());

  return (...args) => render(...args);
}

function templateFixture(fixture: string, standIns: StandIn[]): Plugin {
  return {
    name: 'template-fixture',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === ENTRY) return `\0${ENTRY}`;
      const index = standIns.findIndex((standIn) => standIn.replaces(id, importer));
      return index === -1 ? null : `\0stand-in:${index}`;
    },
    load(id) {
      if (id === `\0${ENTRY}`) return fixture;
      const standIn = /^\0stand-in:(\d+)$/.exec(id);
      return standIn ? standIns[Number(standIn[1])].source : null;
    }
  };
}
