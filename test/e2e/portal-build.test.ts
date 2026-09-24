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

interface BuiltPortal {
  base: string;
  root: string;
  project: DirectoryPath;
  output: DirectoryPath;
}

/** Resolves, prepares, builds and saves a fixture as `portal generate` does. */
async function buildFixture(name: string): Promise<BuiltPortal> {
  const fixture = new DirectoryPath(process.cwd()).join('test/resources/portal-inputs').join(name);
  const base = await ensureBuildDirectoryBase(fixture);
  const root = fs.mkdtempSync(path.join(base, 'portal-e2e-'));

  const source = (await new PortalSourceContext(fixture).resolve())._unsafeUnwrap();

  const project = new DirectoryPath(root).join('build');
  fs.mkdirSync(project.toString(), { recursive: true });
  const prepared = (await new PortalProjectService().prepare(project, source))._unsafeUnwrap();

  const build = await new PortalBuildService().build(prepared);
  if (build.isErr()) {
    throw new Error(`${build.error.message}\n${build.error.log.split('\n').slice(-20).join('\n')}`);
  }
  expect(build.value.pageCount).to.be.greaterThan(1);

  const output = new DirectoryPath(root).join('portal');
  (await new PortalContext(output).save(build.value.output, false))._unsafeUnwrap();
  return { base, root, project, output };
}

async function removeBuilt(built: BuiltPortal | undefined): Promise<void> {
  if (built === undefined) return;
  fs.rmSync(built.root, { recursive: true, force: true });
  await removeBuildDirectoryBase(built.base);
}

/**
 * Vite strips types without checking them, and nothing else in the repository imports the
 * routes and components, so this is the one place the template is held to its types. It runs
 * after a build because the build generates the route tree the router imports.
 */
async function typeCheck(project: DirectoryPath) {
  const require = createRequire(import.meta.url);
  const typesDirectory = path.join(project.toString(), 'node_modules', '@types');
  fs.mkdirSync(typesDirectory, { recursive: true });
  // React's types are development dependencies of the CLI, so the prepared project does not
  // link them the way it links the packages the build runs with.
  for (const name of ['react', 'react-dom']) {
    const target = path.dirname(require.resolve(`@types/${name}/package.json`));
    fs.symlinkSync(target, path.join(typesDirectory, name), process.platform === 'win32' ? 'junction' : 'dir');
  }

  // The bare `typescript` dependency is the linter's TypeScript 6 copy (see "TypeScript
  // toolchain" in .ai/instructions.md) and TypeScript 7 does not export its `bin` directory,
  // so reach the compiler `build` runs through its manifest.
  const manifest = require.resolve('@typescript/native/package.json');
  const tsc = path.join(path.dirname(manifest), require(manifest).bin.tsc);
  return execa(
    process.execPath,
    [tsc, '-p', path.join(project.toString(), 'tsconfig.json'), '--noEmit', '--pretty', 'false'],
    { cwd: project.toString(), reject: false, all: true }
  );
}

/** The browser's scripts, by name. */
const scriptsOf = (output: DirectoryPath) =>
  fs
    .readdirSync(path.join(output.toString(), 'assets'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, text: fs.readFileSync(path.join(output.toString(), 'assets', name), 'utf8') }));

const stylesheetOf = (output: DirectoryPath) => {
  const assets = path.join(output.toString(), 'assets');
  return fs
    .readdirSync(assets)
    .filter((name) => name.endsWith('.css'))
    .map((name) => fs.readFileSync(path.join(assets, name), 'utf8'))
    .join('\n');
};

(enabled ? describe : describe.skip)('portal build (end to end)', function () {
  this.timeout(10 * 60 * 1000);

  const fixture = new DirectoryPath(process.cwd()).join('test/resources/portal-inputs/default');

  let built: BuiltPortal | undefined;
  let project: DirectoryPath;
  let output: DirectoryPath;

  before(async () => {
    built = await buildFixture('default');
    ({ project, output } = built);
  });

  after(async () => {
    await removeBuilt(built);
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

  // Skipped: `defineDocs({ dir })` compiles the content directory's absolute path into the
  // client bundle as its `base`, and `src/lib/source.ts` cannot move behind `.server` because
  // the browser imports it to lazy load page bodies. A relative directory is no drop-in: the
  // same literal is substituted into the stylesheet, which resolves it from elsewhere.
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

  // The fixture's `content/guides/` is named by its `nav.json` rather than by its directory,
  // which is the only proof the title reaches a real build rather than the in-memory loader.
  // The Guides tab holding it is called "Guides" too, so that name is counted, not looked for.
  it('names a folder from its nav.json instead of its directory', () => {
    const tree = read(treeCacheFiles()[0]);

    expect(tree).to.contain('"Developer Guides"');
    expect(tree.split('"Guides"').length - 1, 'nodes named "Guides"').to.equal(1);
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

  it('type-checks against the packages it is built with', async () => {
    const result = await typeCheck(project);

    expect(result.exitCode, result.all).to.equal(0);
  });

  // The layout puts the tab bar in the header, and the prerendered page carries it,
  // so the tabs are there before any script runs.
  it('renders the top level as tabs in the header, in the order nav.json gives', () => {
    const page = read('index.html');
    const tab = (href: string, name: string) =>
      page.search(new RegExp(`href="${href}"[^>]*><span[^>]*>${name}</span></a>`));
    const positions = [
      tab('/', 'Home'),
      tab('/api/apimatic-calculator/simple-calculator/Calculate', 'API Reference'),
      tab('/authentication', 'Guides')
    ];

    expect(
      positions.every((at) => at !== -1),
      'a tab is missing'
    ).to.be.true;
    expect(positions).to.deep.equal([...positions].sort((left, right) => left - right));
  });

  // The browser imports `portal.identity.json` whole, which is safe only because nothing in
  // it, and nothing else the CLI writes, addresses the build machine.
  it('ships what the browser is told, and nothing from the build-only config', () => {
    const scripts = scriptsOf(output);

    expect(scripts.some((script) => script.text.includes('pageActions'))).to.be.true;
    expect(
      scripts.filter((script) => /contentDir|staticDir/.test(script.text)).map((script) => script.name)
    ).to.deep.equal([]);
  });

  it('loads Geist and the neutral theme', () => {
    const css = stylesheetOf(output);

    expect(read('index.html')).to.contain('https://fonts.googleapis.com/css2?family=Geist:wght@100..900');
    expect(css).to.contain('--default-font-family:"Geist"');
    // The theme's light primary, which nothing in the fixture overrides.
    expect(css).to.match(/--color-fd-primary:#171717/);
  });

  // The counterpart of the branded portal's forced mode: the same label, present here.
  it('offers the colour-mode switch when both modes are allowed', () => {
    expect(read('index.html')).to.contain('aria-label="Toggle Theme"');
  });
});

/**
 * A second portal, so one more build covers the brand and navigation settings the default
 * fixture leaves at their defaults: a logo per mode, a favicon, a primary colour, a forced
 * colour mode and header links. Its specification has a deprecated and an internal operation,
 * and it has no content directory, so it also covers the fallback home page.
 */
(enabled ? describe : describe.skip)('portal build, branded (end to end)', function () {
  this.timeout(10 * 60 * 1000);

  let built: BuiltPortal | undefined;
  let output: DirectoryPath;

  before(async () => {
    built = await buildFixture('branded');
    ({ output } = built);
  });

  after(async () => {
    await removeBuilt(built);
  });

  const read = (relative: string) => fs.readFileSync(path.join(output.toString(), relative), 'utf8');
  const exists = (relative: string) => fs.existsSync(path.join(output.toString(), relative));

  // The minifier may merge the two modes' rules when they match, as they do for a primary
  // written once, so the selectors and their place are checked rather than one spelling.
  it("lays the primary over the theme in both modes, after the theme's own rules", () => {
    const css = stylesheetOf(output);
    // The theme's own dark background, which nothing the CLI writes sets.
    const themeDark = css.search(/\.dark\{--color-fd-background:/);
    const overrides = [...css.matchAll(/([^{}]+)\{--color-fd-primary:#1d4ed8;--color-fd-primary-foreground:#fafafa/g)];
    const selectors = overrides.flatMap((rule) => rule[1].split(',').map((selector) => selector.trim()));

    expect(themeDark).to.not.equal(-1);
    expect(selectors).to.include.members([':root:not(.dark)', '.dark']);
    expect(overrides.every((rule) => (rule.index ?? -1) > themeDark)).to.be.true;
  });

  it('shows the logo for each mode, and the favicon with its type', () => {
    const page = read('index.html');

    expect(page).to.match(/<img src="\/logo-light\.svg"[^>]*class="[^"]*dark:hidden/);
    expect(page).to.match(/<img src="\/logo-dark\.svg"[^>]*class="[^"]*hidden[^"]*dark:block/);
    expect(page).to.match(/<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
    expect(exists('logo-dark.svg')).to.be.true;
    // Classes only the template uses, so they exist only if Tailwind scanned it.
    expect(stylesheetOf(output)).to.match(/\.dark\\:block/);
  });

  // The DOM itself, after hydration, is checked by hand in a browser; the page as served
  // carries the forced mode for next-themes' inline script and no switch to leave it.
  it('fixes the colour mode to dark and offers no way out of it', () => {
    const page = read('index.html');

    expect(page).to.contain('"class","theme","dark","dark"');
    expect(page).to.not.contain('aria-label="Toggle Theme"');
  });

  it('builds a home page without an index page, with the header link and a tab of its own', () => {
    const page = read('index.html');
    const tree = fs
      .readdirSync(path.join(output.toString(), '__tsr/staticServerFnCache'))
      .map((name) => fs.readFileSync(path.join(output.toString(), '__tsr/staticServerFnCache', name), 'utf8'))
      .find((text) => text.includes('"pageTree"'));

    expect(page).to.contain('href="https://status.example.com"');
    expect(tree, 'no page tree').to.not.be.undefined;
    expect(tree).to.contain('/tab/home');
    expect(tree).to.contain('/page/home');
  });

  it('documents the deprecated operation and leaves the internal one out, pages and sidebar alike', () => {
    expect(exists('api/pets/pets/listPets/index.html')).to.be.true;
    expect(exists('api/pets/pets/createPet/index.html')).to.be.true;
    expect(exists('api/pets/pets/auditPets/index.html')).to.be.false;

    const everything = fs
      .readdirSync(path.join(output.toString(), '__tsr/staticServerFnCache'))
      .map((name) => fs.readFileSync(path.join(output.toString(), '__tsr/staticServerFnCache', name), 'utf8'))
      .join('\n');
    expect(everything).to.contain('List pets');
    expect(everything).to.contain('Create a pet');
    expect(everything).to.not.contain('Audit the pets');
  });
});
