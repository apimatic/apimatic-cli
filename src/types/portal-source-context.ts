import { ExportFormats } from '@apimatic/sdk';
import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { errorMessage } from '../utils/error-utils.js';
import { isJsonObject } from '../utils/json-utils.js';
import { ApimaticConfigContext } from './apimatic-config-context.js';
import { APIMATIC_CONFIG_FILE_NAME, ApimaticConfigDocument, findingSentences } from './apimatic-config/document.js';
import { Directory } from './file/directory.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { NOT_FOUND_FILE_NAME, SHELL_FILE_NAME } from './portal-context.js';
import {
  CONTENT_DIRECTORY_NAME,
  METADATA_FILE_NAME,
  SPEC_DIRECTORY_NAME,
  STATIC_DIRECTORY_NAME
} from './project-layout.js';
import { PLACEHOLDER_SITE, SiteConfig, SuggestedSite } from './portal/config/site-config.js';
import { AcceptedContent, ContentFile, ContentTree, ReadPage } from './portal/content-tree.js';
import { Endpoint } from './portal/endpoint.js';
import { GeneratedPages, PluginSource } from './portal/generated-pages.js';
import { OpenApiDocument } from './portal/openapi-document.js';
import { parsePage } from './portal/page.js';
import { PortalConfig } from './portal/portal-config.js';
import { PortalLanguages } from './portal/portal-languages.js';
import { NAVIGATION_FILE_NAME, TOKENS } from './portal/portal-navigation.js';
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
import { shared } from './portal/shared.js';
import { SpecMetadata } from './portal/spec-metadata.js';
import { SpecContext } from './spec-context.js';
import { TRANSFORMATIONS_DIRECTORY_NAME, transformedFileName } from './transform-context.js';

const SPEC_EXTENSIONS = ['.json', '.yaml', '.yml'];

const METADATA_FILE = new FileName(METADATA_FILE_NAME);

const definitionNames = (fileNames: FileName[]): FileName[] =>
  fileNames.filter((name) => !name.isEqual(METADATA_FILE) && !name.isHidden());

const isDocumentName = (name: FileName): boolean => SPEC_EXTENSIONS.some((extension) => name.hasExtension(extension));

type DiscoveredSpecs = Pick<PortalSource, 'specs' | 'suggestedSite' | 'unmergedSpecs' | 'leftOutSpecs'>;

/** An OpenAPI 3.x document at the top of a directory, read for its operations and the site it suggests. */
interface ReadDocument {
  file: FilePath;
  endpoints: Endpoint[];
  site: SuggestedSite;
}

/** The specifications read from `spec/`, and the site the first of them suggests. */
interface ReadSpecs {
  specs: PortalSpec[];
  suggested: SuggestedSite;
}

/** The folders `APIMATIC-META.json` merges, in the order the platform merges them. */
interface MergedFolders {
  metadata: FilePath;
  folders: DirectoryPath[];
}

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

  private get metadataFile(): FilePath {
    return new FilePath(this.specDirectory, METADATA_FILE);
  }

  private get contentDirectory(): DirectoryPath {
    return this.sourceDirectory.join(CONTENT_DIRECTORY_NAME);
  }

  private get staticDirectory(): DirectoryPath {
    return this.sourceDirectory.join(STATIC_DIRECTORY_NAME);
  }

  private get configFile(): FilePath {
    return new FilePath(this.sourceDirectory, new FileName(APIMATIC_CONFIG_FILE_NAME));
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
    const { specs, suggestedSite, unmergedSpecs, leftOutSpecs } = discovered.value;

    const settings = await this.settingsFrom(document.value, suggestedSite);
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
      suggestedSite,
      specs,
      specDirectory: this.specDirectory,
      unmergedSpecs,
      leftOutSpecs,
      sharedEndpoints: shared(specs.flatMap(({ file, endpoints }) => endpoints.map((key) => ({ key, file })))),
      contentDirectory,
      staticDirectory,
      shadowedFiles: staticDirectory === null ? [] : await this.shadowedFiles(staticDirectory),
      contentNotices: accepted.value.notices
    });
  }

  /** The `spec/` half of `resolve`, for quickstart to refuse a project the build would refuse before writing into it. */
  public async resolveSpecs(): Promise<Result<PortalSpec[], PortalSourceProblem>> {
    return (await this.specs()).map(({ specs }) => specs);
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
      const installed = await new SpecContext(this.specDirectory).install(specPath);
      if (installed.isErr()) {
        return err({ kind: 'sourceUnwritable', reason: installed.error.reason });
      }
      const config = PortalConfig.scaffolded(await this.suggestedSite(specPath));
      // Every default is spelled out, so the block shows what can be set, and the schema lets an
      // editor complete and check the rest.
      const written = await this.mergeConfig((document) =>
        document.referencingSchema(schemaUrl).with('portal', config.toJSON())
      );
      if (written.isErr()) {
        return err(written.error);
      }
      await this.writeContent(config.siteTitle());
      return ok(this.configFile);
    } catch (error) {
      return err({ kind: 'sourceUnwritable', reason: errorMessage(error) });
    }
  }

  /** Names the site after the spec and writes a starter content/, each only where the project has none. */
  public async adopt(namedAfter: PortalSpec): Promise<Result<FilePath, PortalScaffoldProblem>> {
    try {
      const site = await this.suggestedSite(namedAfter.file);
      // A block or a site that is not an object is left for the build to report.
      const written = await this.mergeConfig((document) => {
        const portal = document.portal() ?? {};
        if (!isJsonObject(portal)) {
          return document;
        }
        if (portal.site === undefined) {
          return document.with('portal', { site: SiteConfig.suggested(site).toJSON(), ...portal });
        }
        return isJsonObject(portal.site) && portal.site.name === undefined
          ? document.with('portal', { ...portal, site: { name: site.name, ...portal.site } })
          : document;
      });
      if (written.isErr()) {
        return err(written.error);
      }
      if (!(await this.fileService.directoryExists(this.contentDirectory))) {
        const config = PortalConfig.fromBlock(written.value.portal(), site);
        await this.writeContent(config.isOk() ? config.value.siteTitle() : site.name);
      }
      return ok(this.configFile);
    } catch (error) {
      return err({ kind: 'sourceUnwritable', reason: errorMessage(error) });
    }
  }

  private async mergeConfig(
    apply: (document: ApimaticConfigDocument) => ApimaticConfigDocument
  ): Promise<Result<ApimaticConfigDocument, PortalScaffoldProblem>> {
    const written = await this.configContext.merge(['portal'], apply);
    return written.mapErr((failure) => ({
      kind: failure === 'unreadable' ? ('configUnreadable' as const) : ('configUnwritable' as const)
    }));
  }

  private async writeContent(siteTitle: string): Promise<void> {
    await this.fileService.createDirectoryIfNotExists(this.contentDirectory);
    const summary = `Getting started with ${siteTitle}`;
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
        `Welcome to the ${siteTitle} documentation.`,
        '',
        'Replace this page with your own introduction, and add more Markdown pages beside it.',
        ''
      ].join('\n')
    );
    // Each section a tab, as the sample portal has; Home's sidebar leads with the welcome page.
    await this.fileService.writeContents(
      new FilePath(this.contentDirectory, new FileName(NAVIGATION_FILE_NAME)),
      JSON.stringify({ tabs: TOKENS, pages: ['index', '...'] }, null, 2) + '\n'
    );
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
  private async specs(): Promise<Result<DiscoveredSpecs, PortalSourceProblem>> {
    const { fileNames, folders } = await this.specDirectoryListing();
    const merge = await this.mergedFolders(fileNames, folders);
    if (merge.isErr()) {
      return err(merge.error);
    }

    const usedSlugs = new Set<string>(RESERVED_SPEC_SLUGS);
    const read =
      merge.value === null
        ? await this.topLevelSpecs(fileNames, folders, usedSlugs)
        : await this.mergedSpecs(merge.value, usedSlugs);
    if (read.isErr()) {
      return err(read.error);
    }
    const { specs, suggested } = read.value;
    const several = specs.length > 1;
    return ok({
      specs,
      suggestedSite: several ? null : suggested,
      unmergedSpecs: several && merge.value === null ? specs.map(({ file }) => file) : [],
      leftOutSpecs: merge.value === null ? [] : await this.leftOutSpecs(fileNames)
    });
  }

  /** The folders `APIMATIC-META.json` merges, or null when it is not there or does not merge. */
  private async mergedFolders(
    fileNames: FileName[],
    folders: DirectoryPath[]
  ): Promise<Result<MergedFolders | null, PortalSourceProblem>> {
    // Found in the listing, so its name matches exactly where the file system ignores case.
    if (!fileNames.some((name) => name.isEqual(METADATA_FILE))) {
      return ok(null);
    }
    const metadata = await this.readMetadata(this.metadataFile);
    if (metadata === undefined) {
      return err({ kind: 'unreadableMetadata', file: this.metadataFile });
    }
    if (!metadata.mergesApis()) {
      return ok(null);
    }
    const listed = metadata.mergeOrder()?.map((folder) => this.specDirectory.resolve(folder));
    // A folder the file names twice, as `alpha` and `./alpha`, is still one API.
    const once = listed?.filter((folder, index) => index === listed.findIndex((other) => other.isEqual(folder)));
    return ok({ metadata: this.metadataFile, folders: once ?? folders });
  }

  /** The documents at the top of `spec/`, each a section named after its file. */
  private async topLevelSpecs(
    fileNames: FileName[],
    folders: DirectoryPath[],
    usedSlugs: Set<string>
  ): Promise<Result<ReadSpecs, PortalSourceProblem>> {
    const names = definitionNames(fileNames);
    if (names.length === 0) {
      return err({ kind: 'emptySpecDirectory', folders });
    }
    return (await this.definitions(this.specDirectory, names)).map((documents) => ({
      specs: documents.map(({ file, endpoints }) => ({
        slug: this.uniqueSlug(file.name().normalize(), usedSlugs),
        file,
        endpoints
      })),
      suggested: documents[0].site
    }));
  }

  /** The one definition of each merged folder, a section named after the folder, as the platform builds the SDKs. */
  private async mergedSpecs(
    { metadata, folders }: MergedFolders,
    usedSlugs: Set<string>
  ): Promise<Result<ReadSpecs, PortalSourceProblem>> {
    if (folders.length === 0) {
      return err({ kind: 'noFoldersToMerge', metadata });
    }
    const listings = await Promise.all(
      folders.map(async (folder) => ({
        folder,
        fileNames: (await this.isMergeable(folder))
          ? definitionNames(await this.fileService.getFileNames(folder)).sort((left, right) => left.compare(right))
          : []
      }))
    );
    const empty = listings.filter(({ fileNames }) => fileNames.length === 0).map(({ folder }) => folder);
    if (empty.length > 0) {
      return err({ kind: 'emptyMergedFolders', metadata, folders: empty });
    }

    const specs: PortalSpec[] = [];
    const sites: SuggestedSite[] = [];
    for (const { folder, fileNames } of listings) {
      const read = await this.definitions(folder, fileNames);
      if (read.isErr()) {
        return err(read.error);
      }
      // The platform builds the folder from the first of them by name, which may be one of shared parts.
      const [definition, ...others] = read.value;
      if (others.length > 0) {
        return err({ kind: 'severalSpecsInFolder', files: read.value.map(({ file }) => file) });
      }
      const slug = this.uniqueSlug(new FileName(folder.leafName()).slugified(), usedSlugs);
      specs.push({ slug, file: definition.file, endpoints: definition.endpoints });
      sites.push(definition.site);
    }
    return ok({ specs, suggested: sites[0] });
  }

  /** Whether the platform finds `folder` in the build it is sent: below `spec/`, and spelt on disk as it is named. */
  private async isMergeable(folder: DirectoryPath): Promise<boolean> {
    if (!this.specDirectory.isAncestorOf(folder)) {
      return false;
    }
    const spelt = await this.fileService.directorySpelledOnDisk(this.specDirectory, folder);
    return spelt !== null && spelt.isEqual(folder);
  }

  /** The API definitions at the top of `spec/`, which a merge of its folders leaves out, as the platform does. */
  private async leftOutSpecs(fileNames: FileName[]): Promise<FilePath[]> {
    const files = definitionNames(fileNames)
      .filter(isDocumentName)
      .map((fileName) => new FilePath(this.specDirectory, fileName));
    const definitions = await Promise.all(
      files.map(async (file) => (await this.readDocument(file))?.isApiDefinition() === true)
    );
    return files.filter((_, index) => definitions[index]);
  }

  /** The OpenAPI 3.x documents at the top of a directory, or how to convert what is there instead. */
  private async definitions(
    directory: DirectoryPath,
    fileNames: FileName[]
  ): Promise<Result<ReadDocument[], PortalSourceProblem>> {
    // The site each suggests rather than the document itself, as specifications run to megabytes.
    const documents: ReadDocument[] = [];

    // What each one is, for the conversion a directory without an OpenAPI 3.x document is pointed to.
    const otherFormats: { file: FilePath; format: string }[] = [];
    const documentNames = fileNames.filter(isDocumentName);
    for (const fileName of documentNames) {
      const file = new FilePath(directory, fileName);
      const document = await this.readDocument(file);
      if (document === undefined) {
        return err({ kind: 'unreadableSpec', file });
      }
      const format = document.format();
      if (!format.supported) {
        if (format.format !== null) {
          otherFormats.push({ file, format: format.format });
        }
        continue;
      }

      documents.push({ file, endpoints: await this.endpoints(document, file), site: document.suggestedSite() });
    }

    if (documents.length === 0) {
      const [convertible] = otherFormats;
      // No document declares its format: one the portal would read, by extension, is named before any other file.
      const conversion =
        convertible === undefined
          ? this.conversion(new FilePath(directory, documentNames[0] ?? fileNames[0]), null, 0)
          : this.conversion(convertible.file, convertible.format, otherFormats.length - 1);
      return err({ kind: 'noOpenApiSpec', conversion });
    }
    return ok(documents);
  }

  private conversion(file: FilePath, format: string | null, others: number): SpecConversion {
    const into = file.directory().join(TRANSFORMATIONS_DIRECTORY_NAME);
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
      // Sorted because folders merged without an order of their own are merged by name.
      folders: directory.items
        .flatMap((item) => (item instanceof Directory ? [item.directoryPath] : []))
        .sort((left, right) => left.compare(right))
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

  private async readMetadata(file: FilePath): Promise<SpecMetadata | undefined> {
    try {
      return SpecMetadata.parse(await this.fileService.getContents(file));
    } catch {
      return undefined;
    }
  }

  private uniqueSlug(name: FileName, used: Set<string>): string {
    const base = name.toString() || 'api';
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
