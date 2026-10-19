import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { normalizePath, type Plugin } from 'vite';
import { staticImages } from '../../portal-template/static-images';

type Resolve = (source: string, importer: string | undefined, options: object) => unknown;

interface ResolveHook {
  filter: { id: RegExp };
  handler: (this: { resolve: Resolve }, source: string, importer: string | undefined, options: object) => unknown;
}

const resolveHook = (plugins: Plugin[]) => plugins[0].resolveId as unknown as ResolveHook;

/** The preview's plugin for a portal served under `base`, where Vite counts a `.png` as an asset. */
function previewLoad(staticDirectory: string, base = '/'): (id: string) => string | null {
  const preview = staticImages(staticDirectory)[1];
  const configResolved = preview.configResolved as (config: object) => void;
  configResolved({ base, assetsInclude: (file: string) => file.endsWith('.png') });
  return preview.load as (id: string) => string | null;
}

describe('staticImages', () => {
  let root: string;
  let real: string;
  let linked: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'static-images-'));
    fs.mkdirSync(path.join(root, 'static'));
    real = normalizePath(fs.realpathSync.native(path.join(root, 'static')));
    linked = path.join(root, 'linked');
    fs.symlinkSync(path.join(root, 'static'), linked, process.platform === 'win32' ? 'junction' : 'dir');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves the absolute path Fumadocs puts behind a `./` across Windows drives', () => {
    const hook = resolveHook(staticImages(null));
    const asked: unknown[][] = [];
    const resolve: Resolve = (...args) => {
      asked.push(args);
      return 'resolved';
    };

    for (const source of ['./D:/site/x.png', './d:/site/x.png']) {
      expect(hook.filter.id.test(source), source).to.be.true;
    }
    const resolved = hook.handler.call({ resolve }, './D:/site/src/static/x.png', 'C:/project/content/page.md', {
      isEntry: false
    });

    expect(resolved).to.equal('resolved');
    expect(asked).to.deep.equal([
      ['D:/site/src/static/x.png', 'C:/project/content/page.md', { isEntry: false, skipSelf: true }]
    ]);
  });

  // The CLI builds no portal from a network share, so Fumadocs' `.///server/share/…` is not taken either.
  it('leaves every other import to Vite', () => {
    const { filter } = resolveHook(staticImages(null));

    for (const source of [
      './local.png',
      './/local.png',
      '../static/x.png',
      'D:/site/x.png',
      '/images/x.png',
      'fumadocs-ui',
      './//server/share/x.png'
    ]) {
      expect(filter.id.test(source), source).to.be.false;
    }
  });

  it('changes only the preview, and only for a portal with a static directory', () => {
    expect(staticImages(null).map((plugin) => plugin.name)).to.deep.equal(['apimatic:static-images:resolve']);
    expect(staticImages(linked)[1].apply).to.equal('serve');
  });

  it('loads a static image as the address the public directory serves it at, under the base', () => {
    expect(previewLoad(real)(`${real}/images/x.png`)).to.equal('export default "/images/x.png";');
    expect(previewLoad(real, '/docs/')(`${real}/images/x.png`)).to.equal('export default "/docs/images/x.png";');
  });

  it('knows the static directory by its own spelling and by its real one', () => {
    const load = previewLoad(linked);

    expect(load(`${normalizePath(linked)}/images/x.png`)).to.equal('export default "/images/x.png";');
    expect(load(`${real}/images/x.png`)).to.equal('export default "/images/x.png";');
  });

  it('leaves a query, a file that is no asset and a file elsewhere to Vite', () => {
    const load = previewLoad(real);

    expect(load(`${real}/images/x.png?raw`)).to.be.null;
    expect(load(`${real}/data.json`)).to.be.null;
    expect(load(`${normalizePath(root)}/elsewhere/x.png`)).to.be.null;
  });
});
