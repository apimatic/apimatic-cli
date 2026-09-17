import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { expect } from 'chai';

const repositoryRoot = process.cwd();
const templateRoot = path.join(repositoryRoot, 'portal-template');

const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));

function templateFiles(): string[] {
  return fs
    .readdirSync(templateRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(templateRoot, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
}

/**
 * The template is built inside a temp project whose node_modules holds one link per
 * dependency the CLI declares. Anything it imports that the CLI does not depend on would
 * resolve here, where every package is installed, and fail only on a user's machine.
 */
describe('portal template packaging', () => {
  it('imports only packages the CLI declares as dependencies', () => {
    const declared = new Set(Object.keys(manifest.dependencies));
    const offenders = new Set<string>();

    for (const file of templateFiles().filter((name) => /\.tsx?$/.test(name))) {
      const source = fs.readFileSync(path.join(templateRoot, file), 'utf8');
      for (const match of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        const specifier = match[1];
        if (specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('node:')) continue;
        // Subpath exports such as `fumadocs-ui/mdx` resolve through their own package.
        const packageName = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0];
        if (!declared.has(packageName)) offenders.add(packageName);
      }
    }

    expect([...offenders], 'template imports packages the CLI does not depend on').to.be.empty;
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

  it('carries no nested .gitignore, which would drop files from the package', () => {
    expect(templateFiles().filter((file) => path.basename(file) === '.gitignore')).to.be.empty;
  });
});
