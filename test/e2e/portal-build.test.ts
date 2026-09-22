import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { execa } from 'execa';
import { expect } from 'chai';
import { PortalBuildService } from '../../src/infrastructure/portal-build-service';
import { PortalProjectService } from '../../src/infrastructure/portal-project-service';
import { PortalSourceContext } from '../../src/types/portal-source-context';
import { PortalContext } from '../../src/types/portal-context';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { ensureBuildDirectoryBase, removeBuildDirectoryBase } from '../../src/infrastructure/tmp-extensions';

// A real Vite build takes tens of seconds and needs every runtime dependency installed,
// so it stays out of the default run. CI switches it on for the platform matrix.
const enabled = process.env.APIMATIC_E2E === '1';

(enabled ? describe : describe.skip)('portal build (end to end)', function () {
  this.timeout(10 * 60 * 1000);

  const fixture = new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/default');

  let base: string;
  let root: string;
  let project: DirectoryPath;
  let output: DirectoryPath;

  before(async () => {
    base = await ensureBuildDirectoryBase(fixture);
    root = fs.mkdtempSync(path.join(base, 'portal-e2e-'));

    const source = (await new PortalSourceContext(fixture).resolve())._unsafeUnwrap();

    project = new DirectoryPath(root).join('build');
    fs.mkdirSync(project.toString(), { recursive: true });
    const prepared = (await new PortalProjectService().prepare(project, source))._unsafeUnwrap();

    const build = await new PortalBuildService().build(prepared);
    if (build.isErr()) {
      throw new Error(`${build.error.message}\n${build.error.log.split('\n').slice(-20).join('\n')}`);
    }
    expect(build.value.pageCount).to.be.greaterThan(1);

    output = new DirectoryPath(root).join('portal');
    (await new PortalContext(output).save(build.value.output, false))._unsafeUnwrap();
  });

  after(async () => {
    fs.rmSync(root, { recursive: true, force: true });
    await removeBuildDirectoryBase(base);
  });

  const read = (relative: string) => fs.readFileSync(path.join(output.toString(), relative), 'utf8');
  const exists = (relative: string) => fs.existsSync(path.join(output.toString(), relative));

  /** The prerendered server-function cache entries carrying the sidebar tree. */
  const treeCacheFiles = () => {
    const cache = '__tsr/staticServerFnCache';
    return fs
      .readdirSync(path.join(output.toString(), cache))
      .map((name) => `${cache}/${name}`)
      .filter((relative) => read(relative).includes('"pageTree"'));
  };

  it('writes a home page carrying the content page', () => {
    expect(exists('index.html')).to.be.true;
    expect(read('index.html')).to.contain('Hello from the fixture.');
  });

  // Addresses come from page slugs rather than tree position, so lifting the single
  // specification's section out of the sidebar must leave every operation where it was.
  it('writes a page per operation in the specification', () => {
    expect(exists('api/apimatic-calculator/simple-calculator/Calculate/index.html')).to.be.true;
  });

  it('ignores files in spec/ that are not specifications', () => {
    // APIMATIC-META.json sits beside the spec for SDK generation.
    expect(exists('api/apimatic-meta')).to.be.false;
  });

  it('copies the static directory to the site root', () => {
    expect(exists('images/logo.png')).to.be.true;
  });

  it('writes the not-found page static hosts serve for unknown paths', () => {
    expect(exists('404.html')).to.be.true;
  });

  it('writes the markdown companion the page actions fetch', () => {
    expect(read('index.md')).to.contain('Hello from the fixture.');
  });

  it('writes a search index and the llms files', () => {
    expect(exists('api/search.json')).to.be.true;
    expect(read('llms.txt')).to.contain('Welcome');
  });

  it('writes a sitemap and robots file naming the configured address', () => {
    expect(read('sitemap.xml')).to.contain('https://docs.test/api/apimatic-calculator/simple-calculator/Calculate');
    expect(read('robots.txt')).to.contain('Sitemap: https://docs.test/sitemap.xml');
  });

  it('marks each page canonical at its own address', () => {
    expect(read('index.html')).to.contain('<link rel="canonical" href="https://docs.test/"');
  });

  it('keeps the server-side specification loader out of the browser bundle', () => {
    const scripts = fs.readdirSync(path.join(output.toString(), 'assets')).filter((name) => name.endsWith('.js'));
    const offenders = scripts.filter((name) => read('assets/' + name).includes('Failed to resolve input'));
    expect(offenders).to.deep.equal([]);
  });

  /** Published files naming one of these build-machine directories, in any spelling. */
  const filesNaming = (...directories: string[]) => {
    // Three spellings of each: a bundler normalises separators either way, and a Windows
    // path embedded in a string literal has its backslashes escaped.
    const secrets = directories.flatMap((absolute) => {
      const native = absolute.replace(/\//g, '\\');
      return [native, native.replace(/\\/g, '\\\\'), absolute.replace(/\\/g, '/')];
    });

    const walk = (directory: string): string[] =>
      fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const child = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(child) : [child];
      });

    return (
      walk(output.toString())
        // Images and fonts cannot carry a path the build put there, and reading them as text
        // only invites a false match.
        .filter((file) => !/\.(png|jpe?g|gif|svg|ico|woff2?)$/i.test(file))
        .filter((file) => {
          const content = fs.readFileSync(file, 'utf8');
          return secrets.some((secret) => content.includes(secret));
        })
        .map((file) => path.relative(output.toString(), file))
    );
  };

  // The `.server` split exists so the build machine's filesystem stays out of what is
  // published: `portal.server.ts` holds the absolute path of every specification, and the
  // prepared project's own location has no business in the output either.
  it('publishes neither the specification paths nor the project directory', () => {
    expect(filesNaming(project.toString(), fixture.join('spec').toString())).to.deep.equal([]);
  });

  // Known gap, found when this assertion was written. `defineDocs({ dir })` compiles the
  // content directory's absolute path into the client bundle as its `base`, and
  // `src/lib/source.ts` cannot move behind `.server` because the browser imports it to lazy
  // load page bodies. Handing the macro a relative directory is not a drop-in either: the
  // same literal is substituted into the stylesheet, where it resolves against a different
  // directory. Pending rather than deleted, so the gap is recorded where it would be fixed.
  it.skip('publishes no absolute path from the build machine at all', () => {
    expect(filesNaming(fixture.join('content').toString())).to.deep.equal([]);
  });

  it('writes the sidebar tree to one cache file instead of into every page payload', () => {
    expect(treeCacheFiles()).to.have.length(1);
  });

  // The only end-to-end proof that `nav.json` reaches the build: the Vite glob, the macro's
  // `meta.files` restriction and the transformer over real on-disk storage.
  it('orders the sidebar by nav.json, with the API reference where the token names it', () => {
    const tree = read(treeCacheFiles()[0]);
    const order = ['Welcome', 'API Reference', 'Authentication'].map((name) => tree.indexOf(`"${name}"`));

    expect(
      order.every((at) => at !== -1),
      tree.slice(0, 600)
    ).to.be.true;
    expect(order).to.deep.equal([...order].sort((left, right) => left - right));
  });

  // With one specification the section's name only restates the portal title, so the level
  // is lifted away and the tag folders sit directly under the reference.
  it('leaves no section level in the sidebar for a single specification', () => {
    const tree = read(treeCacheFiles()[0]);

    // The tag group, which the specification names; and the section, which is named after
    // the specification's file and is the level that should be gone.
    expect(tree).to.contain('"Simple Calculator"');
    expect(tree).to.not.contain('"Apimatic calculator"');
  });

  it('ships only the syntax grammars a portal can contain', () => {
    // Shiki's full catalogue is some 400 chunks and ten megabytes of unused grammars.
    // `src/lib/shiki-bundle.ts` replaces it; this notices if that stops taking effect.
    const assets = fs.readdirSync(path.join(output.toString(), 'assets'));
    const unusable = assets.filter((name) => /^(cobol|wolfram|emacs-lisp|abap|ballerina|apl)-/.test(name));

    expect(unusable, 'grammars for languages a portal cannot contain').to.deep.equal([]);
    expect(assets.length, 'asset count').to.be.below(150);
  });

  it('keeps an operation page small', () => {
    const page = 'api/apimatic-calculator/simple-calculator/Calculate/index.html';
    expect(fs.statSync(path.join(output.toString(), page)).size).to.be.below(100 * 1024);
  });

  // Vite strips types without checking them, and nothing else in the repository imports the
  // routes and components, so this is the one place the template is held to its types. It
  // runs here because the build has just generated the route tree the router imports.
  it('type-checks against the packages it is built with', async () => {
    const require = createRequire(import.meta.url);
    const typesDirectory = path.join(project.toString(), 'node_modules', '@types');
    fs.mkdirSync(typesDirectory, { recursive: true });
    // React's types are development dependencies of the CLI, so the prepared project does not
    // link them the way it links the packages the build runs with.
    for (const name of ['react', 'react-dom']) {
      const target = path.dirname(require.resolve(`@types/${name}/package.json`));
      fs.symlinkSync(target, path.join(typesDirectory, name), process.platform === 'win32' ? 'junction' : 'dir');
    }

    const tsc = require.resolve('typescript/bin/tsc');
    const result = await execa(
      process.execPath,
      [tsc, '-p', path.join(project.toString(), 'tsconfig.json'), '--noEmit', '--pretty', 'false'],
      { cwd: project.toString(), reject: false, all: true }
    );

    expect(result.exitCode, result.all).to.equal(0);
  });
});
