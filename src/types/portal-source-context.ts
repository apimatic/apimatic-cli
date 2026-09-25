import { ExportFormats } from '@apimatic/sdk';
import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { errorMessage } from '../utils/error-utils.js';
import { ApimaticConfigContext } from './apimatic-config-context.js';
import { APIMATIC_CONFIG_FILE_NAME, ApimaticConfigDocument, findingSentences } from './apimatic-config/document.js';
import { Directory } from './file/directory.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { NOT_FOUND_FILE_NAME, SHELL_FILE_NAME } from './portal-context.js';
import { CONTENT_DIRECTORY_NAME, SPEC_DIRECTORY_NAME, STATIC_DIRECTORY_NAME } from './project-layout.js';
import { PLACEHOLDER_SITE, SuggestedSite } from './portal/config/site-config.js';
import { AcceptedContent, ContentFile, ContentTree, ReadPage } from './portal/content-tree.js';
import { Endpoint } from './portal/endpoint.js';
import { GeneratedPages, PluginSource } from './portal/generated-pages.js';
import { OpenApiDocument } from './portal/openapi-document.js';
import { parsePage } from './portal/page.js';
import { PortalConfig } from './portal/portal-config.js';
import { PortalLanguages } from './portal/portal-languages.js';
import { NAVIGATION_FILE_NAME } from './portal/portal-navigation.js';
import {
  ContentProblem,
  MissingFile,
  MissingImage,
  MissingStaticFile,
  PortalScaffoldProblem,
  PortalSettings,
  PortalSource,
  PortalSourceProblem,
  PortalSpec,
  SpecConversion
} from './portal/portal-source.js';
import { SpecContext } from './spec-context.js';
import { TRANSFORMATIONS_DIRECTORY_NAME, transformedFileName } from './transform-context.js';

const SPEC_EXTENSIONS = ['.json', '.yaml', '.yml'];

// Empty on purpose: the portal's own routes under /api/ are files with extensions --
// /api/search.json -- so none can collide with a spec section, which is always a directory.
// Pages the user puts under content/api/ share the directory, and `hiddenPages` reports the
// ones a section's generated metadata keeps out of the sidebar.
const RESERVED_SPEC_SLUGS: string[] = [];

// Names the build writes at the root of the site. The static directory is copied there
// first, so a file of the same name replaces the generated one without a word.
const GENERATED_ROOT_FILES = [
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'llms-full.txt',
  'index.html',
  NOT_FOUND_FILE_NAME,
  SHELL_FILE_NAME
];

export class PortalSourceContext {
  private readonly fileService = new FileService();
  private readonly configContext: ApimaticConfigContext;

  constructor(private readonly sourceDirectory: DirectoryPath) {
    this.configContext = new ApimaticConfigContext(sourceDirectory);
  }

  private get specDirectory(): DirectoryPath {
    return this.sourceDirectory.join(SPEC_DIRECTORY_NAME);
  }

  private get contentDirectory(): DirectoryPath {
    return this.sourceDirectory.join(CONTENT_DIRECTORY_NAME);
  }

  private get staticDirectory(): DirectoryPath {
    return this.sourceDirectory.join(STATIC_DIRECTORY_NAME);
  }

  /** Reads and validates the whole source directory, or reports the first problem found. */
  public async resolve(): Promise<Result<PortalSource, PortalSourceProblem>> {
    const document = await this.readConfigDocument();
    if (document.isErr()) {
      return err(document.error);
    }

    // Read before the block is parsed: the block's site name and description default to what
    // the only specification says about itself.
    const discovered = await this.specs();
    if (discovered.isErr()) {
      return err(discovered.error);
    }
    const { specs, suggested } = discovered.value;

    const settings = await this.settingsFrom(document.value, suggested);
    if (settings.isErr()) {
      return err(settings.error);
    }

    const staticDirectory = (await this.fileService.directoryExists(this.staticDirectory))
      ? this.staticDirectory
      : null;
    const contentDirectory = await this.existingContentDirectory();

    const accepted = await this.content(contentDirectory, specs, settings.value.generatedPages);
    if (accepted.isErr()) {
      return err({ kind: 'invalidContent', problems: accepted.error });
    }

    return ok({
      ...settings.value,
      suggestedSite: suggested,
      specs,
      contentDirectory,
      staticDirectory,
      shadowedFiles: staticDirectory === null ? [] : await this.shadowedFiles(staticDirectory),
      contentNotices: accepted.value.notices
    });
  }

  /**
   * The `content/` half of `resolve`, for `portal serve` to run on each save, against the `specs`
   * it found and the generated pages the preview shows.
   */
  public async resolveContent(
    specs: PortalSpec[],
    generatedPages: GeneratedPages
  ): Promise<Result<AcceptedContent, ContentProblem[]>> {
    return await this.content(await this.existingContentDirectory(), specs, generatedPages);
  }

  private async existingContentDirectory(): Promise<DirectoryPath | null> {
    return (await this.fileService.directoryExists(this.contentDirectory)) ? this.contentDirectory : null;
  }

  /** The content tree, read and handed to the rules the build reads it by. */
  private async content(
    contentDirectory: DirectoryPath | null,
    specs: PortalSpec[],
    generatedPages: GeneratedPages
  ): Promise<Result<AcceptedContent, ContentProblem[]>> {
    // Walked once, and every check reads the one tree: `getDirectory` stats every entry in it.
    // Not swallowed: a tree that cannot be walked would otherwise pass as one with no files,
    // and a `nav.json` in it would go unvalidated to a build that drops bad entries silently.
    let tree: Directory;
    try {
      tree =
        contentDirectory === null
          ? new Directory(this.contentDirectory, [])
          : await this.fileService.getDirectory(contentDirectory);
    } catch {
      return err([{ kind: 'unreadableContent' }]);
    }

    const content = new ContentTree(tree, this.sourceDirectory);
    const pages = await this.readPages(content.pages());
    const read = {
      pages,
      navigationFiles: await this.read(content.navigationFiles()),
      missingImages: await this.missingImages(pages, content)
    };
    return content.check(read, specs, generatedPages).map((notices) => ({
      notices,
      // Each was read, or the check would have refused the page it could not.
      files: [...read.pages, ...read.navigationFiles].flatMap(({ file, contents }) =>
        contents === undefined ? [] : [{ file, contents }]
      )
    }));
  }

  private async readPages(files: FilePath[]): Promise<ReadPage[]> {
    const read = await this.read(files);
    return await Promise.all(
      read.map(async ({ file, contents }) => ({
        file,
        contents,
        parsed:
          contents === undefined
            ? undefined
            : await parsePage(contents, file.name(), file.relativeTo(this.sourceDirectory))
      }))
    );
  }

  // The build imports each one, and fails as a whole over one it cannot find, naming no page.
  private async missingImages(pages: ReadPage[], content: ContentTree): Promise<MissingImage[]> {
    const missing: MissingImage[] = [];
    for (const { file: page, parsed } of pages) {
      for (const { url, line, from, path } of parsed?.images ?? []) {
        const file = FilePath.resolve(from === 'static' ? this.staticDirectory : page.directory(), path);
        // One beside its page that `content/`'s copy leaves out is never looked for.
        if (from === 'page' && !content.holds(file)) {
          missing.push({ page, line, url, missing: null });
          continue;
        }
        const missingFile = await this.missingFile(file);
        if (missingFile !== null) {
          missing.push({ page, line, url, missing: missingFile });
        }
      }
    }
    return missing;
  }

  // A file that cannot be read is reported by the check rather than thrown out of `resolve`.
  private async read(files: FilePath[]): Promise<ContentFile[]> {
    return await Promise.all(
      files.map(async (file) => ({ file, contents: await this.fileService.getContents(file).catch(() => undefined) }))
    );
  }

  /**
   * The `apimatic.json` half of `resolve`, for `portal serve` to run on every edit, so an edit
   * is accepted exactly when a build would accept it. `suggested` is what `resolve` found in the
   * specifications, which are not read again; changing them needs a restart anyway.
   */
  public async resolveSettings(suggested: SuggestedSite | null): Promise<Result<PortalSettings, PortalSourceProblem>> {
    const document = await this.readConfigDocument();
    if (document.isErr()) {
      return err(document.error);
    }
    return this.settingsFrom(document.value, suggested);
  }

  private async settingsFrom(
    document: ApimaticConfigDocument,
    suggested: SuggestedSite | null
  ): Promise<Result<PortalSettings, PortalSourceProblem>> {
    const settings = PortalSourceContext.parseSettings(document, suggested);
    if (settings.isErr()) {
      return err(settings.error);
    }
    // The block checks the shape of each path, not that the file is there -- and a missing
    // logo renders as a broken image on every page of a build that otherwise reports success.
    const missingFiles = await this.missingStaticFiles(settings.value.config);
    if (missingFiles.length > 0) {
      return err({ kind: 'missingStaticFiles', files: missingFiles });
    }
    return ok(settings.value);
  }

  private async readConfigDocument(): Promise<Result<ApimaticConfigDocument, PortalSourceProblem>> {
    const state = await this.configContext.read();
    if (state.state === 'missing') {
      return err({ kind: 'missingConfig' });
    }
    if (state.state === 'unparseable') {
      return err({ kind: 'invalidConfig', errors: findingSentences(state.findings), missingPortal: false });
    }
    return ok(state.document);
  }

  /**
   * The root and the `languages` block are this command's to judge as well, since the portal
   * documents the project's SDK languages. The `plugin` block is the plugin commands' to judge,
   * so it never fails a build and nothing in it is read: an object gets the context plugin page
   * whatever it holds, and anything else counts as no block.
   */
  private static parseSettings(
    document: ApimaticConfigDocument,
    suggested: SuggestedSite | null
  ): Result<PortalSettings, PortalSourceProblem> {
    const block = document.portal();
    const config = PortalConfig.fromBlock(block, suggested);
    const languages = PortalLanguages.fromBlock(document.languages(), document.findingsFor('languages'));
    const errors = [
      ...findingSentences(document.findingsFor('root')),
      ...(config.isErr() ? config.error : []),
      ...(languages.isErr() ? languages.error : [])
    ];
    if (config.isErr() || languages.isErr() || errors.length > 0) {
      return err({ kind: 'invalidConfig', errors, missingPortal: block === undefined });
    }
    return ok({
      config: config.value,
      generatedPages: GeneratedPages.of(languages.value, PortalSourceContext.pluginSource(config.value, document))
    });
  }

  /** A hosted plugin is installed from its address, whatever the block says; otherwise the block's is bundled. */
  private static pluginSource(config: PortalConfig, document: ApimaticConfigDocument): PluginSource | null {
    const url = config.pluginUrl();
    if (url !== null) {
      return { kind: 'hosted', url };
    }
    return document.plugin() === undefined ? null : { kind: 'bundled' };
  }

  private async missingStaticFiles(config: PortalConfig): Promise<MissingStaticFile[]> {
    const missing: MissingStaticFile[] = [];
    for (const asset of config.staticFiles()) {
      const missingFile = await this.missingFile(asset.resolveIn(this.sourceDirectory));
      if (missingFile !== null) {
        missing.push({ setting: asset.settingPath(), ...missingFile });
      }
    }
    return missing;
  }

  /** How the build would miss `file`: not there, or there in another case; null when it is there as spelt. */
  private async missingFile(file: FilePath): Promise<MissingFile | null> {
    const found = await this.fileService.spelledOnDisk(this.sourceDirectory, file);
    return found?.isEqual(file) ? null : { file, foundAs: found };
  }

  /**
   * Writes everything `portal generate` and `portal serve` need but the `languages` block,
   * which the user adds by hand until the wizard asks for it. Every fault is reported rather
   * than thrown, the file service's included: the caller is a wizard that has asked its
   * questions already. Answers with the `apimatic.json` it wrote.
   */
  public async scaffold(specPath: FilePath, schemaUrl: string): Promise<Result<FilePath, PortalScaffoldProblem>> {
    try {
      await new SpecContext(this.specDirectory).install(specPath);
    } catch (error) {
      return err({ kind: 'sourceUnwritable', reason: errorMessage(error) });
    }
    return await this.adopt(specPath, schemaUrl);
  }

  /** The same tree around a specification the project already carries, which is left where it is. */
  public async adopt(specPath: FilePath, schemaUrl: string): Promise<Result<FilePath, PortalScaffoldProblem>> {
    try {
      return await this.writeSourceTree(specPath, schemaUrl);
    } catch (error) {
      return err({ kind: 'sourceUnwritable', reason: errorMessage(error) });
    }
  }

  /**
   * The document the portal speaks for, and the one quickstart validates when it adopts a
   * project someone downloaded rather than asking for a specification the project has.
   */
  public async primarySpec(): Promise<FilePath | null> {
    const fileName = (await this.specDirectoryListing()).fileNames.find((name) =>
      SPEC_EXTENSIONS.some((extension) => name.hasExtension(extension))
    );
    return fileName === undefined ? null : new FilePath(this.specDirectory, fileName);
  }

  private async writeSourceTree(
    specPath: FilePath,
    schemaUrl: string
  ): Promise<Result<FilePath, PortalScaffoldProblem>> {
    const site = await this.suggestedSite(specPath);
    const config = PortalConfig.scaffolded(site);
    // A downloaded build carries `spec/` and no config, so the merge creates the file on both
    // paths. Every default is spelled out, so the block shows what can be set, and the schema
    // lets an editor complete and check the rest.
    const written = await this.configContext.merge(['portal'], (document) =>
      document.referencingSchema(schemaUrl).with('portal', config.toJSON())
    );
    if (written.isErr()) {
      return err({ kind: written.error === 'unreadable' ? 'configUnreadable' : 'configUnwritable' });
    }

    await this.fileService.createDirectoryIfNotExists(this.contentDirectory);
    const summary = `Getting started with ${config.siteTitle()}`;
    await this.fileService.writeContents(
      new FilePath(this.contentDirectory, new FileName('index.md')),
      [
        '---',
        'title: Welcome',
        // JSON is valid YAML. Quoting through it keeps a title carrying ': ' or '#' from
        // breaking the front matter, which fails the whole build rather than one page.
        `description: ${JSON.stringify(summary)}`,
        '---',
        '',
        `Welcome to the ${config.siteTitle()} documentation.`,
        '',
        'Replace this page with your own introduction, and add more Markdown pages beside it.',
        ''
      ].join('\n')
    );
    // Orders the sidebar: named pages first, then everything else alphabetically.
    await this.fileService.writeContents(
      new FilePath(this.contentDirectory, new FileName(NAVIGATION_FILE_NAME)),
      JSON.stringify({ pages: ['index', '...'] }, null, 2) + '\n'
    );
    return ok(new FilePath(this.sourceDirectory, new FileName(APIMATIC_CONFIG_FILE_NAME)));
  }

  // A split specification arrives as an archive, whose parts are left to the build to read.
  private async suggestedSite(specPath: FilePath): Promise<SuggestedSite> {
    if (await this.fileService.isZipFile(specPath)) {
      return PLACEHOLDER_SITE;
    }
    const document = await this.readDocument(specPath);
    return document === undefined ? PLACEHOLDER_SITE : document.suggestedSite();
  }

  /**
   * Files at the top of `static/` that the build would otherwise have generated itself. Only
   * the top level is read: nothing below it can land on one of these names, and walking the
   * whole tree let one unreadable entry throw out of `resolve`, which otherwise returns a Result.
   */
  private async shadowedFiles(staticDirectory: DirectoryPath): Promise<FileName[]> {
    const fileNames = await this.fileService.getFileNames(staticDirectory);
    return fileNames.filter((fileName) => GENERATED_ROOT_FILES.some((generated) => fileName.is(generated)));
  }

  // With several specifications there is no suggested site: no one of them speaks for the portal.
  private async specs(): Promise<
    Result<{ specs: PortalSpec[]; suggested: SuggestedSite | null }, PortalSourceProblem>
  > {
    const specs: PortalSpec[] = [];
    // Only the first is kept: it is the one that speaks for the portal when it is alone, and
    // specifications run to megabytes.
    let first: OpenApiDocument | undefined;
    const usedSlugs = new Set<string>(RESERVED_SPEC_SLUGS);

    const { fileNames, folders } = await this.specDirectoryListing();
    if (fileNames.length === 0) {
      return err({ kind: 'emptySpecDirectory', folders });
    }

    // What each one is, for the conversion a directory without an OpenAPI 3.x document is pointed to.
    const otherFormats: { file: FilePath; format: string }[] = [];
    const documentNames = fileNames.filter((name) => SPEC_EXTENSIONS.some((extension) => name.hasExtension(extension)));
    for (const fileName of documentNames) {
      const file = new FilePath(this.specDirectory, fileName);
      const document = await this.readDocument(file);
      if (document === undefined) {
        return err({ kind: 'unreadableSpec', fileName });
      }
      const format = document.format();
      if (!format.supported) {
        if (format.format !== null) {
          otherFormats.push({ file, format: format.format });
        }
        continue;
      }

      specs.push({ slug: this.uniqueSlug(fileName, usedSlugs), file, endpoints: await this.endpoints(document, file) });
      first ??= document;
    }

    if (first === undefined) {
      const [convertible] = otherFormats;
      const conversion =
        convertible === undefined
          ? this.conversion(new FilePath(this.specDirectory, fileNames[0]), null, 0)
          : this.conversion(convertible.file, convertible.format, otherFormats.length - 1);
      return err({ kind: 'noOpenApiSpec', conversion });
    }
    return ok({ specs, suggested: specs.length === 1 ? first.suggestedSite() : null });
  }

  private conversion(file: FilePath, format: string | null, others: number): SpecConversion {
    const into = this.specDirectory.join(TRANSFORMATIONS_DIRECTORY_NAME);
    const converted = new FilePath(into, transformedFileName(file, ExportFormats.Openapi3Yaml));
    return { file, format, converted, others };
  }

  private async specDirectoryListing(): Promise<{ fileNames: FileName[]; folders: DirectoryPath[] }> {
    if (!(await this.fileService.directoryExists(this.specDirectory))) {
      return { fileNames: [], folders: [] };
    }
    const directory = await this.fileService.getDirectory(this.specDirectory);
    return {
      // Sorted because this order decides which of two names that normalise to the same slug
      // keeps it, and which document becomes the default server.
      fileNames: directory.items
        .flatMap((item) => ('fileName' in item ? [item.fileName] : []))
        .sort((left, right) => left.compare(right)),
      folders: directory.items.flatMap((item) => (item instanceof Directory ? [item.directoryPath] : []))
    };
  }

  // A path item in another file is read from it; one that file refers on to again is not followed.
  private async endpoints(document: OpenApiDocument, file: FilePath): Promise<Endpoint[]> {
    const referenced = await Promise.all(
      document.pathItemReferences(file.directory()).map(async ({ path, file: target, pointer }) => {
        const targetDocument = await this.readDocument(target);
        return targetDocument?.endpointsAt(path, pointer) ?? [];
      })
    );
    return [...document.endpoints(), ...referenced.flat()];
  }

  private async readDocument(file: FilePath): Promise<OpenApiDocument | undefined> {
    try {
      return OpenApiDocument.parse(file.name(), await this.fileService.getContents(file));
    } catch {
      return undefined;
    }
  }

  private uniqueSlug(fileName: FileName, used: Set<string>): string {
    const base = fileName.normalize().toString() || 'api';
    let slug = base;
    let suffix = 2;
    while (used.has(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(slug);
    return slug;
  }
}
