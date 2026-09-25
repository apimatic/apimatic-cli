import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'node:module';
import { expect } from 'chai';
import {
  COPIED_DEPENDENCIES,
  LINKED_DEPENDENCIES,
  PortalBuildPaths,
  TEMPLATE_DEPENDENCIES
} from '../src/infrastructure/portal-project-service';
import { GENERATED_DIRECTORY_NAME, PAGE_TEMPLATES } from '../src/types/portal/generated-pages';
import { PortalIdentity } from '../src/types/portal/portal-config';
import type { BuildPaths } from '../portal-template/portal-config';
import type { Portal } from '../portal-template/src/lib/portal-types';

/** True only when the two types are identical, every nested field and union member included. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const repositoryRoot = process.cwd();
const templateRoot = path.join(repositoryRoot, 'portal-template');

const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));

/** Every package specifier the template imports, from its modules and its stylesheet. */
function templateImports(): string[] {
  const specifiers: string[] = [];
  for (const file of templateFiles().filter((name) => /\.(tsx?|css)$/.test(name))) {
    const source = fs.readFileSync(path.join(templateRoot, file), 'utf8');
    const patterns = file.endsWith('.css')
      ? [/@import\s+['"]([^'"]+)['"]/g]
      : [/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g];
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (/^(\.|@\/|node:|https?:)/.test(specifier)) continue;
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

function pageTemplateFiles(): string[] {
  return fs.readdirSync(path.join(repositoryRoot, 'portal-pages'));
}

function templateFiles(): string[] {
  return fs
    .readdirSync(templateRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(templateRoot, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

// Data URIs, absolute URLs and root-relative paths are left as written, so they resolve anywhere.
const RELATIVE_URL = /url\(\s*['"]?(?![\s'")]|[a-z][\w+.-]*:|\/|#)/i;

function usesRelativeUrl(packageName: string): boolean {
  return fs
    .readdirSync(path.join(repositoryRoot, 'node_modules', packageName), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .some((entry) => RELATIVE_URL.test(fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8')));
}

// The temp project installs only TEMPLATE_DEPENDENCIES; anything else resolves here but fails on a user's machine.
describe('portal template packaging', () => {
  it('imports only packages the temp project installs', () => {
    const installed = new Set(TEMPLATE_DEPENDENCIES);
    const offenders = new Set<string>();

    for (const specifier of templateImports()) {
      // Subpath exports such as `fumadocs-ui/mdx` resolve through their own package.
      const packageName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      if (!installed.has(packageName)) offenders.add(packageName);
    }

    expect([...offenders], 'template imports packages the temp project does not install').to.be.empty;
  });

  // CI keeps the CLI and the build on one drive, where a linked `url()` still resolves, so only this catches it.
  it('links no package whose stylesheets use a relative url()', () => {
    expect(
      LINKED_DEPENDENCIES.filter(usesRelativeUrl),
      'copy these into the project (COPIED_DEPENDENCIES) instead of linking them'
    ).to.be.empty;
  });

  // pnpm keeps a package's dependencies beside it, not inside it, so a copy would leave them behind.
  it('copies only packages that need it and have no dependencies of their own', () => {
    for (const name of COPIED_DEPENDENCIES) {
      const packageManifest = JSON.parse(
        fs.readFileSync(path.join(repositoryRoot, 'node_modules', name, 'package.json'), 'utf8')
      );

      expect(usesRelativeUrl(name), `${name} has no relative url() to need copying`).to.be.true;
      const { dependencies, peerDependencies, optionalDependencies } = packageManifest;
      expect({ ...dependencies, ...peerDependencies, ...optionalDependencies }, name).to.be.empty;
    }
  });

  // The converse: a package the CLI stops depending on would be missing at build time for everyone.
  it('installs only packages the CLI declares as dependencies', () => {
    const declared = new Set(Object.keys(manifest.dependencies));

    expect(TEMPLATE_DEPENDENCIES.filter((name) => !declared.has(name))).to.be.empty;
  });

  it('is listed in the published files, with the page templates', () => {
    expect(manifest.files).to.include.members(['./portal-template', './portal-pages']);
  });

  it('ships every template file and page template in the package', function () {
    this.timeout(120_000);
    const packed = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32'
    });
    const packedPaths = new Set<string>((JSON.parse(packed)[0].files as { path: string }[]).map((entry) => entry.path));

    const missing = [
      ...templateFiles().map((file) => `portal-template/${file}`),
      ...pageTemplateFiles().map((file) => `portal-pages/${file}`)
    ].filter((file) => !packedPaths.has(file));

    expect(missing, 'template files missing from the published package').to.be.empty;
  });

  // `PortalPagesService` reads a template by the name `GeneratedPages` gives it, so one on
  // either side alone is a page that fails to render, or a file nothing reads.
  it('holds exactly the page templates the generated pages are rendered from', () => {
    expect(pageTemplateFiles().sort()).to.deep.equal(PAGE_TEMPLATES.map((name) => `${name}.mdx`).sort());
  });

  it('keeps the content directory placeholder the CLI substitutes', () => {
    const source = fs.readFileSync(path.join(templateRoot, 'src/lib/source.ts'), 'utf8');

    // Without this the build would read whatever path the template was authored with.
    expect(source).to.contain("'__APIMATIC_CONTENT_DIR__'");
  });

  // The literal reaches the browser bundle as the collection's base, so it must stay relative;
  // it must also be the directory the CLI writes the generated pages into.
  it('compiles the generated pages from the directory the CLI writes them to, by a relative name', () => {
    const source = fs.readFileSync(path.join(templateRoot, 'src/lib/source.ts'), 'utf8');

    expect(source).to.match(new RegExp(`defineDocs\\(\\{\\s*dir: '${GENERATED_DIRECTORY_NAME}',`));
  });

  it('registers the plugin that reloads the generated pages under portal serve', () => {
    const config = fs.readFileSync(path.join(templateRoot, 'vite.config.ts'), 'utf8');

    expect(config).to.contain('generatedPagesReload()');
  });

  // The generated primary has the theme's own specificity, so it wins only by coming after it.
  it('imports the neutral theme, and the stylesheet the CLI generates after everything else', () => {
    const stylesheet = fs.readFileSync(path.join(templateRoot, 'src/styles/app.css'), 'utf8');
    const imports = [...stylesheet.matchAll(/@import\s+'([^']+)'/g)].map((match) => match[1]);

    expect(imports).to.include('fumadocs-ui/css/neutral.css');
    expect(imports[imports.length - 1]).to.equal('./theme.css');
  });

  // The two sides are compiled apart and the template casts the files it reads, so nothing else
  // holds them together: a field or a value only one side knows builds a portal that is quietly
  // missing it. The compiler checks this when `pretest` runs; the assertion only reports it.
  it('declares exactly what the CLI writes for it', () => {
    const identity: Equal<Portal, PortalIdentity> = true;
    const paths: Equal<BuildPaths, PortalBuildPaths> = true;

    expect(identity).to.equal(true);
    expect(paths).to.equal(true);
  });

  // The CLI writes these into the prepared project; a copy in the template would be a second
  // set of defaults that nothing but a stray local build ever read, and it would ship.
  it('ships none of the files the CLI generates', () => {
    const generated = ['portal.config.json', 'portal.identity.json', 'src/styles/theme.css'];

    expect(templateFiles().filter((file) => generated.includes(file))).to.be.empty;
    expect(templateFiles().filter((file) => file.startsWith(`${GENERATED_DIRECTORY_NAME}/`))).to.be.empty;
  });

  it('carries no nested .gitignore, which would drop files from the package', () => {
    expect(templateFiles().filter((file) => path.basename(file) === '.gitignore')).to.be.empty;
  });

  describe('the trimmed syntax bundle', () => {
    const source = () => fs.readFileSync(path.join(templateRoot, 'src/lib/shiki-bundle.ts'), 'utf8');

    /** The language ids the bundle imports a grammar for. */
    const bundledIds = (): string[] => [...source().matchAll(/shiki\/dist\/langs\/([\w-]+)\.mjs/g)].map((m) => m[1]);

    const keys = (): Set<string> => {
      const text = source();
      const block = /const aliases[^{]*{([\s\S]*?)\n};/.exec(text);
      const aliasKeys = [...(block?.[1] ?? '').matchAll(/^\s*'?([\w#-]+)'?\s*:/gm)].map((m) => m[1]);
      return new Set([...bundledIds(), ...aliasKeys]);
    };

    it('names every grammar it imports by a file that exists', async () => {
      const shiki = path.dirname(createRequire(import.meta.url).resolve('shiki/package.json'));

      for (const id of bundledIds()) {
        expect(fs.existsSync(path.join(shiki, 'dist/langs', `${id}.mjs`)), id).to.be.true;
      }
    });

    it('accepts every alias Shiki gives the languages it bundles', async () => {
      const { bundledLanguagesInfo } = (await import('shiki/bundle/full')) as {
        bundledLanguagesInfo: { id: string; aliases?: string[] }[];
      };
      const present = keys();

      const missing: string[] = [];
      for (const id of bundledIds()) {
        const info = bundledLanguagesInfo.find((entry) => entry.id === id);
        for (const alias of info?.aliases ?? []) {
          if (!present.has(alias)) missing.push(`${alias} (${id})`);
        }
      }

      expect(missing, 'aliases Shiki knows that this bundle would render as plain text').to.be.empty;
    });

    it('points every alias at a language it actually bundles', () => {
      const block = /const aliases[^{]*{([\s\S]*?)\n};/.exec(source());
      const targets = [...(block?.[1] ?? '').matchAll(/:\s*'([\w-]+)'/g)].map((m) => m[1]);
      const bundled = new Set(bundledIds());

      expect(targets).to.not.be.empty;
      expect(targets.filter((target) => !bundled.has(target))).to.be.empty;
    });
  });
});
