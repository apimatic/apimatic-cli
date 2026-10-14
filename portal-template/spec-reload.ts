import type { Plugin } from 'vite';

/** The extensions of the files a specification is read from and refers to: the CLI's own list, held to it by a test. */
export const SPEC_FILE_EXTENSIONS = ['.json', '.yaml', '.yml'];

/**
 * Reloads the preview when a specification file in the specification directory changes, as a document may refer
 * to parts kept in another folder there. The specifications are read at run time rather than imported, so Vite's
 * module graph never learns of them, and the reference pages are built once per evaluation.
 */
export function specReload(specDirectory: string): Plugin {
  const isSpecFile = (file: string) =>
    file.startsWith(`${specDirectory}/`) &&
    SPEC_FILE_EXTENSIONS.some((extension) => file.toLowerCase().endsWith(extension));

  return {
    name: 'apimatic:spec-reload',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(specDirectory);
    },
    // Sent to each environment: the server runner re-evaluates every module, the browser reloads.
    hotUpdate({ file }) {
      if (!isSpecFile(file)) return;
      this.environment.hot.send({ type: 'full-reload' });
      return [];
    }
  };
}
