import { realpathSync } from 'node:fs';
import { normalizePath, type Plugin, type ResolvedConfig } from 'vite';
import { withBasePath } from './src/lib/base-path';

/** A page's images from the static directory, which can sit on another Windows drive than this project. */
export function staticImages(staticDirectory: string | null): Plugin[] {
  const resolve: Plugin = {
    name: 'apimatic:static-images:resolve',
    enforce: 'pre',
    resolveId: {
      // Fumadocs' import of a file on another drive: the absolute path, still behind a `./` (fuma-nama/fumadocs#3723).
      filter: { id: /^\.\/[A-Za-z]:\// },
      handler(source, importer, options) {
        return this.resolve(source.slice(2), importer, { ...options, skipSelf: true });
      }
    }
  };
  if (staticDirectory === null) return [resolve];

  // Vite names a module by its real path, but keeps the spelling of a `subst` drive.
  const directories = [staticDirectory, realpathSync.native(staticDirectory)].map((dir) => `${normalizePath(dir)}/`);
  let config: ResolvedConfig;
  return [
    resolve,
    {
      name: 'apimatic:static-images:serve',
      apply: 'serve',
      enforce: 'pre',
      configResolved(resolved) {
        config = resolved;
      },
      // Vite's dev server serves no file from another drive (vitejs/vite#10802), but its public directory from any.
      load(id) {
        const directory = directories.find((dir) => id.startsWith(dir));
        // A query such as `?raw` asks for more than the address, and stays Vite's to answer.
        if (directory === undefined || id.includes('?') || !config.assetsInclude(id)) return null;
        return `export default ${JSON.stringify(withBasePath(`/${id.slice(directory.length)}`, config.base))};`;
      }
    }
  ];
}
