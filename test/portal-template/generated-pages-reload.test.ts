import { EventEmitter } from 'node:events';
import path from 'path';
import { expect } from 'chai';
import type { ViteDevServer } from 'vite';
import { generatedPagesReload } from '../../portal-template/generated-pages-reload';

// Run against a real dev server in the plan's step 1 spike: without the plugin an added page
// never appeared and a removed one failed every request; with it, each reached the tree.
describe('generatedPagesReload', () => {
  const root = path.resolve('project');
  const sourceModule = path.join(root, 'src', 'lib', 'source.ts');

  /** The watcher's `change` events after the plugin sees `event` for `file`. */
  const changesAfter = (event: string, file: string): unknown[] => {
    const watcher = new EventEmitter();
    const changes: unknown[] = [];
    watcher.on('change', (changed) => changes.push(changed));

    const plugin = generatedPagesReload();
    const configureServer = plugin.configureServer as (server: ViteDevServer) => void;
    configureServer({ config: { root }, watcher } as unknown as ViteDevServer);

    watcher.emit(event, file);
    return changes;
  };

  it('treats a page added or removed under generated/ as an edit to the module declaring the collections', () => {
    for (const event of ['add', 'unlink']) {
      expect(changesAfter(event, path.join(root, 'generated', 'sdks', 'go.mdx')), event).to.deep.equal([sourceModule]);
    }
  });

  it('does the same for a whole folder removed, as the context plugin’s is with its block', () => {
    expect(changesAfter('unlinkDir', path.join(root, 'generated', 'context-plugin'))).to.deep.equal([sourceModule]);
  });

  // An edit to a generated file already reloads; Vite's own handling covers it.
  it('leaves an edit to a generated file to Vite', () => {
    expect(changesAfter('change', path.join(root, 'generated', 'sdks', 'go.mdx'))).to.deep.equal([
      path.join(root, 'generated', 'sdks', 'go.mdx')
    ]);
  });

  it('ignores files added anywhere else, including beside the directory under a similar name', () => {
    for (const file of [
      path.join(root, 'src', 'routes', 'new.tsx'),
      path.join(root, 'generated-backup', 'sdks.mdx'),
      path.join(path.dirname(root), 'generated', 'sdks.mdx')
    ]) {
      expect(changesAfter('add', file), file).to.be.empty;
    }
  });

  // The CLI writes each page under a temporary name beside it and renames it over; only the
  // rename lands on a name the collection reads.
  it('ignores the temporary file a page is written through, and reacts to its nav.json', () => {
    const temporary = path.join(root, 'generated', 'sdks', 'go.mdx.0b6f2c.tmp');

    expect(changesAfter('add', temporary)).to.be.empty;
    expect(changesAfter('unlink', temporary)).to.be.empty;
    expect(changesAfter('add', path.join(root, 'generated', 'sdks', 'nav.json'))).to.deep.equal([sourceModule]);
  });

  it('applies only to the dev server, not the build', () => {
    expect(generatedPagesReload().apply).to.equal('serve');
  });
});
