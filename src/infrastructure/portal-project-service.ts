import { createRequire } from 'node:module';
import path from 'node:path';
import fsExtra from 'fs-extra';
import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { CodeSamples } from '../types/portal/code-samples.js';
import { PortalArtifacts } from '../types/portal/portal-artifacts.js';
import { PortalConfig } from '../types/portal/portal-config.js';
import { PortalSettings, PortalSource } from '../types/portal/portal-source.js';
import { PortalStylesheet } from '../types/portal/portal-stylesheet.js';
import { errorMessage } from '../utils/error-utils.js';
import { envInfo } from './env-info.js';
import { FileService } from './file-service.js';
import { PortalPagesService } from './portal-pages-service.js';

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

/** Beside `portal.config.json`; `src/lib/portal.ts` imports it. */
const IDENTITY_FILE_NAME = 'portal.identity.json';

/** In `src/styles/`, beside `app.css`, which imports it. */
const STYLESHEET_FILE_NAME = 'theme.css';

/**
 * Where the generated pages are written, inside the project: `src/lib/source.ts` names it as a
 * relative literal, which the browser bundle carries, so the portal project's location is never published.
 */
export const GENERATED_DIRECTORY_NAME = 'generated';

/** Where the SDKs and the context plugin are laid out as the site serves them, inside the project. */
export const DOWNLOADS_DIRECTORY_NAME = 'downloads';

export interface PortalProjectPaths {
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
  private readonly pagesService = new PortalPagesService();
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
    source: PortalSource,
    artifacts: PortalArtifacts
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
    await this.writeConfiguration(
      projectDirectory,
      source,
      await this.writeCodeSamples(projectDirectory, artifacts.codeSamples),
      await this.writeDownloads(projectDirectory, artifacts)
    );

    const pages = await this.pagesService.write(projectDirectory.join(GENERATED_DIRECTORY_NAME), source.generatedPages);
    if (pages.isErr()) {
      return err(pages.error);
    }

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

  // The template places the samples on the specs as it bundles them, so the specs are read where they are.
  private async writeCodeSamples(projectDirectory: DirectoryPath, codeSamples: CodeSamples): Promise<FilePath | null> {
    if (codeSamples.isEmpty()) {
      return null;
    }
    const file = new FilePath(projectDirectory, new FileName('code-samples.json'));
    await this.fileService.writeContents(file, JSON.stringify(codeSamples.toJson()));
    return file;
  }

  private async writeDownloads(
    projectDirectory: DirectoryPath,
    artifacts: PortalArtifacts
  ): Promise<DirectoryPath | null> {
    if (artifacts.sdks.size === 0 && artifacts.plugin === undefined) {
      return null;
    }
    const downloads = projectDirectory.join(DOWNLOADS_DIRECTORY_NAME);
    await this.fileService.createDirectoryIfNotExists(downloads);
    for (const [language, archive] of artifacts.sdks) {
      const sdks = downloads.join('sdk');
      await this.fileService.createDirectoryIfNotExists(sdks);
      await this.fileService.copy(archive, new FilePath(sdks, new FileName(`${language}.zip`)));
    }
    if (artifacts.plugin !== undefined) {
      await this.fileService.copy(artifacts.plugin, new FilePath(downloads, new FileName('plugin.zip')));
    }
    return downloads;
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

  private async writeConfiguration(
    projectDirectory: DirectoryPath,
    source: PortalSource,
    codeSamples: FilePath | null,
    downloads: DirectoryPath | null
  ): Promise<void> {
    const contentDirectory = source.contentDirectory ?? projectDirectory.join('content');
    if (source.contentDirectory === null) {
      await this.fileService.createDirectoryIfNotExists(contentDirectory);
    }

    const specs: Record<string, string> = {};
    for (const spec of source.specs) {
      specs[spec.slug] = this.toPosix(spec.file.toString());
    }

    // Everything here addresses this machine, so it stays behind `portal.server.ts` and the
    // build's own config files.
    const configuration = {
      specs,
      codeSamples: codeSamples === null ? null : this.toPosix(codeSamples.toString()),
      contentDir: this.toPosix(contentDirectory.toString()),
      generatedDir: this.toPosix(projectDirectory.join(GENERATED_DIRECTORY_NAME).toString()),
      staticDir: source.staticDirectory === null ? null : this.toPosix(source.staticDirectory.toString()),
      downloadsDir: downloads === null ? null : this.toPosix(downloads.toString())
    };

    await this.fileService.writeContents(
      new FilePath(projectDirectory, new FileName('portal.config.json')),
      JSON.stringify(configuration, null, 2)
    );

    await this.writeAppearance(projectDirectory, source.config);

    // A literal because Fumadocs' `defineDocs` macro rejects anything it cannot read at
    // compile time. Tailwind needs the same path to scan the user's pages: its automatic
    // detection is rooted at this project, which the content directory sits outside of.
    const contentLiteral = JSON.stringify(this.toPosix(contentDirectory.toString()));
    const sourceModule = new FilePath(projectDirectory.join('src').join('lib'), new FileName('source.ts'));
    await this.substitute(sourceModule, CONTENT_DIRECTORY_PLACEHOLDER, contentLiteral);

    const stylesheet = new FilePath(projectDirectory.join('src').join('styles'), new FileName('app.css'));
    await this.substitute(stylesheet, CONTENT_DIRECTORY_PLACEHOLDER, contentLiteral);
  }

  /**
   * The dev server picks the files up and reloads the browser. Each is written only when its
   * contents change, so an edit that leaves the site as it was, such as a plugin command
   * rewriting its own block, reloads nothing; the answer says whether anything was written.
   */
  public async applyConfig(
    projectDirectory: DirectoryPath,
    settings: PortalSettings
  ): Promise<Result<boolean, string>> {
    let written = false;
    try {
      for (const [file, contents] of this.appearanceFiles(projectDirectory, settings.config)) {
        if (await this.fileService.replaceContentsIfChanged(file, contents)) {
          written = true;
        }
      }
    } catch (error) {
      return err(errorMessage(error));
    }
    const pages = await this.pagesService.write(
      projectDirectory.join(GENERATED_DIRECTORY_NAME),
      settings.generatedPages
    );
    return pages.map((pagesWritten) => written || pagesWritten);
  }

  private async writeAppearance(projectDirectory: DirectoryPath, config: PortalConfig): Promise<void> {
    for (const [file, contents] of this.appearanceFiles(projectDirectory, config)) {
      await this.fileService.writeContents(file, contents);
    }
  }

  /**
   * The browser imports `portal.identity.json` whole, since a retained JSON module is not
   * tree-shaken per property, which is why it holds nothing that addresses this machine.
   */
  private appearanceFiles(projectDirectory: DirectoryPath, config: PortalConfig): [FilePath, string][] {
    return [
      [new FilePath(projectDirectory, new FileName(IDENTITY_FILE_NAME)), JSON.stringify(config.identity(), null, 2)],
      [
        new FilePath(projectDirectory.join('src').join('styles'), new FileName(STYLESHEET_FILE_NAME)),
        PortalStylesheet.of(config).toString()
      ]
    ];
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
    const template = envInfo.packageRoot().join('portal-template');
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
