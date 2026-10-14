import type { Plugin } from 'vite';

/**
 * Reloads the preview when any file in the specification directory changes, as a document may refer
 * to parts kept in another folder there. The specifications are read at run time rather than imported,
 * so Vite's module graph never learns of them, and the reference pages are built once per evaluation.
 */
export function specReload(specDirectory: string): Plugin {
  const isInSpecDirectory = (file: string) => file.startsWith(`${specDirectory}/`);

  return {
    name: 'apimatic:spec-reload',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(specDirectory);
    },
    // Sent to each environment: the server runner re-evaluates every module, the browser reloads.
    hotUpdate({ file }) {
      if (!isInSpecDirectory(file)) return;
      this.environment.hot.send({ type: 'full-reload' });
      return [];
    }
  };
}
