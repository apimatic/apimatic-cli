import { expect } from 'chai';
import type { ViteDevServer } from 'vite';
import { specReload } from '../../portal-template/spec-reload';

describe('specReload', () => {
  const specDirectory = '/project/src/spec';

  /** The messages the preview's environment is sent when `file` changes. */
  const sentFor = (file: string): unknown[] => {
    const sent: unknown[] = [];
    const hotUpdate = specReload(specDirectory).hotUpdate as (
      this: { environment: { hot: { send: (message: unknown) => void } } },
      options: { file: string }
    ) => unknown;
    hotUpdate.call({ environment: { hot: { send: (message) => sent.push(message) } } }, { file });
    return sent;
  };

  it('watches the whole spec directory', () => {
    const watched: unknown[] = [];
    const configureServer = specReload(specDirectory).configureServer as (server: ViteDevServer) => void;

    configureServer({ watcher: { add: (paths: unknown) => watched.push(paths) } } as unknown as ViteDevServer);

    expect(watched).to.deep.equal([specDirectory]);
  });

  // A merged folder's document may refer to parts in a folder of their own, as `../common/` from it.
  it('reloads the preview for a change to any file in it, in a merged folder or beside them', () => {
    for (const file of [
      `${specDirectory}/openapi.json`,
      `${specDirectory}/orders/openapi.yaml`,
      `${specDirectory}/common/schemas/order.yaml`
    ]) {
      expect(sentFor(file), file).to.deep.equal([{ type: 'full-reload' }]);
    }
  });

  it('leaves a change anywhere else to Vite, including beside the directory under a similar name', () => {
    for (const file of ['/project/src/content/index.md', '/project/src/spec-backup/openapi.json']) {
      expect(sentFor(file), file).to.be.empty;
    }
  });
});
