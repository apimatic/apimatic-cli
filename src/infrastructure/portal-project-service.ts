import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fsExtra from 'fs-extra';
import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { PortalSource } from '../types/portal/portal-source.js';
import { FileService } from './file-service.js';

/** Minimum Node version TanStack Start's build supports. */
const MINIMUM_NODE_VERSION = [22, 12, 0] as const;

// Linked one by one rather than through a single link to the CLI's `node_modules`: under a
// pnpm global install, `npx` or `pnpm dlx` the package has no nested `node_modules`, and a
// single link also lets Vite write its scratch files into the CLI's own install directory.
const TEMPLATE_DEPENDENCIES = [
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

export interface PortalProjectPaths {
  /** Directory the child process runs in. */
  projectDirectory: DirectoryPath;
  /** Vite's CLI entry point, resolved from the CLI's own dependencies. */
  viteBinary: FilePath;
}

/**
 * Prepares the throwaway Vite project that both `portal generate` and `portal serve` run.
 * The user's `src/` is never copied: the project points at it by absolute path.
 */
export class PortalProjectService {
  private readonly fileService = new FileService();
  private readonly require = createRequire(import.meta.url);

  /** Checks this Node build can run the portal build at all, before any work is done. */
  public runtimeProblem(): string | null {
    const [major, minor] = process.versions.node.split('.').map(Number);
    const [requiredMajor, requiredMinor] = MINIMUM_NODE_VERSION;
    if (major < requiredMajor || (major === requiredMajor && minor < requiredMinor)) {
      return `Building a portal needs Node ${MINIMUM_NODE_VERSION.join('.')} or newer; this is Node ${
        process.versions.node
      }.`;
    }

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

  /**
   * Environment for the child process. Deliberately an allow-list: the auth key must not
   * reach the build, and any stray `VITE_*` variable would be inlined into the output.
   */
  public childEnvironment(): Record<string, string> {
    const allowed = ['PATH', 'Path', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'SYSTEMROOT', 'SystemRoot', 'SystemDrive'];
    const environment: Record<string, string> = {};
    for (const name of allowed) {
      const value = process.env[name];
      if (value !== undefined) {
        environment[name] = value;
      }
    }

    // Large specs push the prerender pass past Node's default heap.
    const nodeOptions = process.env.NODE_OPTIONS ?? '';
    environment.NODE_OPTIONS = `${nodeOptions} --max-old-space-size=4096`.trim();
    return environment;
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

    const configuration = {
      title: source.config.title,
      description: source.config.description,
      logoUrl: source.config.logoSiteUrl(),
      siteUrl: source.config.siteOrigin()?.toString() ?? null,
      specs,
      contentDir: this.toPosix(contentDirectory.toString()),
      staticDir: source.staticDirectory === null ? null : this.toPosix(source.staticDirectory.toString())
    };

    await this.fileService.writeContents(
      new FilePath(projectDirectory, new FileName('portal.config.json')),
      JSON.stringify(configuration, null, 2)
    );

    // The content directory reaches the template as a literal because Fumadocs' `defineDocs`
    // macro rejects anything it cannot read at compile time.
    const sourceModule = new FilePath(projectDirectory.join('src').join('lib'), new FileName('source.ts'));
    const contents = await this.fileService.getContents(sourceModule);
    const literal = JSON.stringify(this.toPosix(contentDirectory.toString()));
    // Replacement supplied as a function: a path containing `$&` or `$1` would otherwise be
    // rewritten by the replacement-pattern syntax.
    await this.fileService.writeContents(
      sourceModule,
      contents.replace(CONTENT_DIRECTORY_PLACEHOLDER, () => literal)
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
