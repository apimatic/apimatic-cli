import path from 'node:path';
import type { Plugin } from 'vite';

/** Where the CLI writes the pages it generates, as `src/lib/source.ts` names it. */
const GENERATED_DIRECTORY = 'generated';

/** The module that declares the collections, and so holds the glob of their files. */
const SOURCE_MODULE = 'src/lib/source.ts';

/**
 * fumadocs-mdx expands each collection into a glob of imports when it transforms
 * `src/lib/source.ts`, and under `vite dev` it does not expand it again when a file is added
 * or removed: an added page never appears, and a removed one fails every request until the
 * server restarts. `portal serve` adds and removes generated pages as `apimatic.json` changes,
 * so an add or remove there is passed on as an edit to that module, which Vite transforms again.
 */
export function generatedPagesReload(): Plugin {
  return {
    name: 'apimatic:generated-pages-reload',
    apply: 'serve',
    configureServer(server) {
      const directory = path.resolve(server.config.root, GENERATED_DIRECTORY);
      const sourceModule = path.resolve(server.config.root, SOURCE_MODULE);
      const onAddOrRemove = (file: string) => {
        if (isInside(directory, file)) {
          server.watcher.emit('change', sourceModule);
        }
      };
      server.watcher.on('add', onAddOrRemove);
      server.watcher.on('unlink', onAddOrRemove);
      server.watcher.on('unlinkDir', onAddOrRemove);
    }
  };
}

// `path.relative` compares case-insensitively on Windows, as the file system there does.
function isInside(directory: string, file: string): boolean {
  const relative = path.relative(directory, path.resolve(file));
  return relative.length > 0 && relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative);
}
