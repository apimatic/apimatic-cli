import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Reloads the preview when a file beside a specification changes. The specifications are read
 * at run time rather than imported, so Vite's module graph never learns of them, and the
 * reference pages are built once per server module evaluation.
 */
export function specReload(specs: Record<string, string>): Plugin {
  const directories = [...new Set(Object.values(specs).map((file) => path.posix.dirname(file)))];
  const isInSpecDirectory = (file: string) => directories.some((directory) => file.startsWith(`${directory}/`));

  return {
    name: 'apimatic:spec-reload',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(directories);
    },
    // Sent to each environment: the server runner re-evaluates every module, the browser reloads.
    hotUpdate({ file }) {
      if (!isInSpecDirectory(file)) return;
      this.environment.hot.send({ type: 'full-reload' });
      return [];
    }
  };
}
