import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fsExtra from 'fs-extra';
import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { CodeSamples } from '../types/portal/code-samples.js';
import { OpenApiDocument } from '../types/portal/openapi-document.js';
import { PortalSource, PortalSpec } from '../types/portal/portal-source.js';
import { FileService } from './file-service.js';

// Linked one by one rather than through a single link to the CLI's `node_modules`: under a
// pnpm global install, `npx` or `pnpm dlx` the package has no nested `node_modules`, and a
// single link also lets Vite write its scratch files into the CLI's own install directory.
export const TEMPLATE_DEPENDENCIES = [
  '@fumadocs/api-docs',
  '@scalar/json-magic',
  '@tailwindcss/vite',
  '@tanstack/react-router',
  '@tanstack/react-start',
  '@tanstack/start-static-server-functions',
  '@vitejs/plugin-react',
  'fumadocs-core',
  'fumadocs-mdx',
  'fumadocs-openapi',
  'fumadocs-ui',
  'lucide-react',
  'react',
  'react-dom',
  'shiki',
  'tailwindcss',
  'tslib',
  'vite'
];

const CONTENT_DIRECTORY_PLACEHOLDER = "'__APIMATIC_CONTENT_DIR__'";
const PORTAL_IDENTITY_PLACEHOLDER = "'__APIMATIC_PORTAL_IDENTITY__'";

export interface PortalProjectPaths {
  projectDirectory: DirectoryPath;
  /** Vite's CLI entry point, resolved from the CLI's own dependencies. */
  viteBinary: FilePath;
}

export interface SampledSource {
  source: PortalSource;
  unsampledSpecs: FileName[];
}

/**
 * Prepares the throwaway Vite project that both `portal generate` and `portal serve` run.
 * The user's `src/` is never copied: the project points at it by absolute path.
 */
export class PortalProjectService {
  private readonly fileService = new FileService();
  private readonly require = createRequire(import.meta.url);

  /** Checks this installation can run the portal build at all, before any work is done. */
  public runtimeProblem(): string | null {
    for (const dependency of TEMPLATE_DEPENDENCIES) {
      if (this.packageDirectory(dependency) === undefined) {
        return `The portal build dependency '${dependency}' is missing from this installation. Reinstall the CLI and try again.`;
      }
    }
    return null;
  }

  public async prepare(
    projectDirectory: DirectoryPath,
    source: PortalSource
  ): Promise<Result<PortalProjectPaths, string>> {
    const template = this.templateDirectory();
    if (template === undefined) {
      return err('The bundled portal template is missing from this installation. Reinstall the CLI and try again.');
    }

    const viteDirectory = this.packageDirectory('vite');
    if (viteDirectory === undefined) {
      return err(
        "The portal build dependency 'vite' is missing from this installation. Reinstall the CLI and try again."
      );
    }

    await this.fileService.copyDirectoryContents(template, projectDirectory);
    await this.linkDependencies(projectDirectory);
    await this.writeConfiguration(projectDirectory, source);

    return ok({
      projectDirectory,
      viteBinary: new FilePath(viteDirectory.join('bin'), new FileName('vite.js'))
    });
  }

  // A spec whose `$ref`s leave `spec/` keeps its original file: they would not resolve from the copy.
  public async addCodeSamples(
    projectDirectory: DirectoryPath,
    source: PortalSource,
    codeSamples: CodeSamples
  ): Promise<SampledSource> {
    const specDirectory = projectDirectory.join('spec');
    await this.fileService.copyDirectoryContents(source.specDirectory, specDirectory);

    const refersOutside = await Promise.all(
      source.specs.map((spec) => this.refersOutside(spec, source.specDirectory))
    );
    const unsampled = source.specs.filter((_, index) => refersOutside[index]);
    const specs = await Promise.all(
      source.specs.map(async (spec) =>
        unsampled.includes(spec) ? spec : this.writeWithCodeSamples(spec, specDirectory, codeSamples)
      )
    );
    return { source: { ...source, specs }, unsampledSpecs: unsampled.map((spec) => spec.file.name()) };
  }

  /**
   * Environment for the child process. Deliberately an allow-list: the auth key must not
   * reach the build, and any stray `VITE_*` variable would be inlined into the output.
   */
  public childEnvironment(): Record<string, string> {
    const allowed = [
      'PATH',
      'Path',
      'HOME',
      'USERPROFILE',
      'TMPDIR',
      'TEMP',
      'TMP',
      'LANG',
      'LC_ALL',
      'SYSTEMROOT',
      'SystemRoot',
      'SystemDrive'
    ];
    const environment: Record<string, string> = {};
    for (const name of allowed) {
      const value = process.env[name];
      if (value !== undefined) {
        environment[name] = value;
      }
    }

    // Large specs push the prerender pass past Node's default heap. V8 honours the last
    // occurrence of the flag, so appending unconditionally would override a limit the user
    // raised on purpose, and lower it on a machine whose default is already higher.
    const nodeOptions = process.env.NODE_OPTIONS ?? '';
    environment.NODE_OPTIONS = /--max[-_]old[-_]space[-_]size/.test(nodeOptions)
      ? nodeOptions
      : `${nodeOptions} --max-old-space-size=4096`.trim();
    return environment;
  }

  // A `../` in a file the spec refers to breaks the copy as surely as one in the spec itself.
  private async refersOutside(spec: PortalSpec, specDirectory: DirectoryPath): Promise<boolean> {
    const visited = new Set([spec.file.toString()]);
    const pending = spec.document.referencedFiles(spec.file.directory());
    for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
      if (!specDirectory.contains(file.directory())) {
        return true;
      }
      if (visited.has(file.toString()) || !(await this.fileService.fileExists(file))) {
        continue;
      }
      visited.add(file.toString());
      const document = OpenApiDocument.parse(file.name(), await this.fileService.getContents(file));
      pending.push(...(document?.referencedFiles(file.directory()) ?? []));
    }
    return false;
  }

  private async writeWithCodeSamples(
    spec: PortalSpec,
    directory: DirectoryPath,
    codeSamples: CodeSamples
  ): Promise<PortalSpec> {
    const file = spec.file.replaceDirectory(directory);
    const document = spec.document.withCodeSamples(codeSamples);
    await this.fileService.writeContents(file, document.serialize(file.name()));
    return { ...spec, file, document };
  }

  private async linkDependencies(projectDirectory: DirectoryPath): Promise<void> {
    const modules = projectDirectory.join('node_modules');
    await this.fileService.createDirectoryIfNotExists(modules);

    for (const dependency of TEMPLATE_DEPENDENCIES) {
      const target = this.packageDirectory(dependency);
      if (target === undefined) {
        continue;
      }
      const link = modules.join(dependency);
      if (dependency.includes('/')) {
        await this.fileService.createDirectoryIfNotExists(new DirectoryPath(path.dirname(link.toString())));
      }
      // A junction is the only link type Windows grants without elevation.
      await fsExtra.symlink(target.toString(), link.toString(), process.platform === 'win32' ? 'junction' : 'dir');
    }
  }

  private async writeConfiguration(projectDirectory: DirectoryPath, source: PortalSource): Promise<void> {
    const contentDirectory = source.contentDirectory ?? projectDirectory.join('content');
    if (source.contentDirectory === null) {
      await this.fileService.createDirectoryIfNotExists(contentDirectory);
    }

    const specs: Record<string, string> = {};
    for (const spec of source.specs) {
      specs[spec.slug] = this.toPosix(spec.file.toString());
    }

    // Only the portal's identity reaches the browser; everything else in the configuration
    // addresses this machine and stays behind `portal.server.ts`. A JSON module is retained
    // whole once client code imports it, so this is substituted into `portal.ts` as a literal.
    const identity = source.config.identity();

    const configuration = {
      ...identity,
      specs,
      contentDir: this.toPosix(contentDirectory.toString()),
      staticDir: source.staticDirectory === null ? null : this.toPosix(source.staticDirectory.toString())
    };

    await this.fileService.writeContents(
      new FilePath(projectDirectory, new FileName('portal.config.json')),
      JSON.stringify(configuration, null, 2)
    );

    const portalModule = new FilePath(projectDirectory.join('src').join('lib'), new FileName('portal.ts'));
    await this.substitute(portalModule, PORTAL_IDENTITY_PLACEHOLDER, JSON.stringify(identity));

    // A literal because Fumadocs' `defineDocs` macro rejects anything it cannot read at
    // compile time. Tailwind needs the same path to scan the user's pages: its automatic
    // detection is rooted at this project, which the content directory sits outside of.
    const contentLiteral = JSON.stringify(this.toPosix(contentDirectory.toString()));
    const sourceModule = new FilePath(projectDirectory.join('src').join('lib'), new FileName('source.ts'));
    await this.substitute(sourceModule, CONTENT_DIRECTORY_PLACEHOLDER, contentLiteral);

    const stylesheet = new FilePath(projectDirectory.join('src').join('styles'), new FileName('app.css'));
    await this.substitute(stylesheet, CONTENT_DIRECTORY_PLACEHOLDER, contentLiteral);
  }

  private async substitute(file: FilePath, placeholder: string, literal: string): Promise<void> {
    const contents = await this.fileService.getContents(file);
    // Replacement supplied as a function: a value containing `$&` or `$1` would otherwise be
    // rewritten by the replacement-pattern syntax.
    await this.fileService.writeContents(
      file,
      contents.replace(placeholder, () => literal)
    );
  }

  private templateDirectory(): DirectoryPath | undefined {
    const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const template = new DirectoryPath(packageRoot).join('portal-template');
    return this.fileService.directoryExistsSync(template) ? template : undefined;
  }

  // `require.resolve` cannot be used directly: a package whose `exports` map hides
  // `package.json` throws, so the candidate roots are walked instead.
  private packageDirectory(name: string): DirectoryPath | undefined {
    for (const candidate of this.require.resolve.paths(name) ?? []) {
      const manifest = path.join(candidate, name, 'package.json');
      if (fsExtra.existsSync(manifest)) {
        return new DirectoryPath(path.dirname(manifest));
      }
    }
    return undefined;
  }

  private toPosix(value: string): string {
    return value.split(path.sep).join('/');
  }
}
