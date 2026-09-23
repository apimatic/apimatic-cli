import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'node:module';
import { expect } from 'chai';
import { TEMPLATE_DEPENDENCIES } from '../src/infrastructure/portal-project-service';
import { GROUP_BY } from '../src/types/portal/config/api-config';
import { COLOR_MODES } from '../src/types/portal/config/brand-config';
import { LAYOUTS } from '../src/types/portal/config/navigation-config';
import { PortalConfig } from '../src/types/portal/portal-config';

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

function templateFiles(): string[] {
  return fs
    .readdirSync(templateRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(templateRoot, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

/**
 * The template is built inside a temp project whose node_modules holds one link per entry in
 * TEMPLATE_DEPENDENCIES, not one per dependency the CLI declares. Anything unlinked still
 * resolves here, where every package is installed, and fails only on a user's machine.
 */
describe('portal template packaging', () => {
  it('imports only packages the temp project links', () => {
    const linked = new Set(TEMPLATE_DEPENDENCIES);
    const offenders = new Set<string>();

    for (const specifier of templateImports()) {
      // Subpath exports such as `fumadocs-ui/mdx` resolve through their own package.
      const packageName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      if (!linked.has(packageName)) offenders.add(packageName);
    }

    expect([...offenders], 'template imports packages the temp project does not link').to.be.empty;
  });

  // The converse: a linked package that the CLI stops depending on would be missing at build
  // time for everyone, with nothing here to notice.
  it('links only packages the CLI declares as dependencies', () => {
    const declared = new Set(Object.keys(manifest.dependencies));

    expect(TEMPLATE_DEPENDENCIES.filter((name) => !declared.has(name))).to.be.empty;
  });

  it('is listed in the published files', () => {
    expect(manifest.files).to.include('./portal-template');
  });

  it('ships every template file in the package', function () {
    this.timeout(120_000);
    const packed = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32'
    });
    const packedPaths = new Set<string>((JSON.parse(packed)[0].files as { path: string }[]).map((entry) => entry.path));

    const missing = templateFiles().filter((file) => !packedPaths.has(`portal-template/${file}`));

    expect(missing, 'template files missing from the published package').to.be.empty;
  });

  it('keeps the content directory placeholder the CLI substitutes', () => {
    const source = fs.readFileSync(path.join(templateRoot, 'src/lib/source.ts'), 'utf8');

    // Without this the build would read whatever path the template was authored with.
    expect(source).to.contain("'__APIMATIC_CONTENT_DIR__'");
  });

  // The two sides are compiled apart, so nothing else holds the browser's `Portal` interface to
  // the file the CLI writes for it.
  it('declares exactly the identity fields the CLI writes', () => {
    const source = fs.readFileSync(path.join(templateRoot, 'src/lib/portal.ts'), 'utf8');
    const block = /export interface Portal \{([\s\S]*?)\n\}/.exec(source);
    const declared = [...(block?.[1] ?? '').matchAll(/^\s*(\w+):/gm)].map((match) => match[1]).sort();

    expect(declared).to.not.be.empty;
    expect(declared).to.deep.equal(
      Object.keys(PortalConfig.scaffolded({ name: 'Acme', description: null }).identity()).sort()
    );
  });

  /** The members of a string-literal union the template declares, in the order written. */
  const unionMembers = (file: string, pattern: RegExp): string[] => {
    const declaration = pattern.exec(fs.readFileSync(path.join(templateRoot, file), 'utf8'));
    return [...(declaration?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1]);
  };

  // A value the CLI accepts and the template does not handle builds a portal that is quietly
  // missing its layout or its theme props.
  it('handles exactly the layouts and colour modes the CLI accepts', () => {
    expect(unionMembers('src/lib/portal.ts', /export type PortalLayout = ([^;]+);/)).to.deep.equal([...LAYOUTS]);
    expect(unionMembers('src/lib/portal.ts', /export type PortalColorMode = ([^;]+);/)).to.deep.equal([...COLOR_MODES]);
  });

  it('groups the reference pages in exactly the ways the CLI accepts', () => {
    expect(unionMembers('portal-config.ts', /groupBy: ([^;]+);/)).to.deep.equal([...GROUP_BY]);
  });

  // The CLI writes these into the prepared project; a copy in the template would be a second
  // set of defaults that nothing but a stray local build ever read, and it would ship.
  it('ships none of the files the CLI generates', () => {
    const generated = ['portal.config.json', 'portal.identity.json', 'src/styles/theme.css'];

    expect(templateFiles().filter((file) => generated.includes(file))).to.be.empty;
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
