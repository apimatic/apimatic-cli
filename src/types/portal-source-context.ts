import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { errorMessage } from '../utils/error-utils.js';
import { ApimaticConfigContext } from './apimatic-config-context.js';
import { APIMATIC_CONFIG_FILE_NAME, ApimaticConfigDocument, findingSentences } from './apimatic-config/document.js';
import { Directory } from './file/directory.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { PLACEHOLDER_SITE, SuggestedSite } from './portal/config/site-config.js';
import { Endpoint } from './portal/endpoint.js';
import { GENERATED_SECTIONS, GeneratedPages, PluginSource } from './portal/generated-pages.js';
import { OpenApiDocument } from './portal/openapi-document.js';
import { PortalConfig } from './portal/portal-config.js';
import { PortalLanguages } from './portal/portal-languages.js';
import { API_REFERENCE_NAME, INDEX_NAME, NAVIGATION_FILE_NAME, PortalNavigation } from './portal/portal-navigation.js';
import {
  MissingStaticFile,
  PortalScaffoldProblem,
  PortalSettings,
  PortalSource,
  PortalSourceProblem,
  PortalSpec,
  ReservedAddressPage
} from './portal/portal-source.js';
import { SpecContext } from './spec-context.js';

const SPEC_EXTENSIONS = ['.json', '.yaml', '.yml'];

/**
 * What a source directory is made of. Named here because the prompts name these directories to
 * the user, and a prompt spelling one differently would send them somewhere that does not exist.
 */
export const SPEC = 'spec';
export const CONTENT = 'content';
export const STATIC = 'static';

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
  '404.html',
  '_shell.html'
];

const NAVIGATION_FILE = new FileName(NAVIGATION_FILE_NAME);

/** Extensions the docs collection compiles, and so the ones an entry can address. */
const PAGE_EXTENSIONS = ['.md', '.mdx'];

/** A `(group)` folder, which the content source leaves out of a page's address. */
const GROUP_FOLDER = /^\(.+\)$/;

/** What one walk of the content tree found: see `PortalSourceContext.navigation`. */
interface NavigationScan {
  errors: string[];
  ignoredFiles: FilePath[];
}

/** A page in the content tree, with its path from the content directory split into segments. */
interface ContentPage {
  file: FilePath;
  segments: string[];
}

/** What the walk found in one directory and everything beneath it. */
interface DirectoryScan {
  /** Whether a page sits anywhere beneath it, which is what makes it a folder in the sidebar. */
  holdsPage: boolean;
  errors: string[];
}

/**
 * The `src/` directory of a portal project: the `portal` block of `apimatic.json`, the OpenAPI
 * documents in `spec/`, and the optional `content/` and `static/` directories.
 */
export class PortalSourceContext {
  private readonly fileService = new FileService();
  private readonly configContext: ApimaticConfigContext;

  constructor(private readonly sourceDirectory: DirectoryPath) {
    this.configContext = new ApimaticConfigContext(sourceDirectory);
  }

  private get specDirectory(): DirectoryPath {
    return this.sourceDirectory.join(SPEC);
  }

  private get contentDirectory(): DirectoryPath {
    return this.sourceDirectory.join(CONTENT);
  }

  private get staticDirectory(): DirectoryPath {
    return this.sourceDirectory.join(STATIC);
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
    const contentDirectory = (await this.fileService.directoryExists(this.contentDirectory))
      ? this.contentDirectory
      : null;

    // Walked once and shared: both the navigation scan and the hidden-page check read the
    // whole content tree, and `getDirectory` stats every entry in it.
    // Not swallowed: a tree that cannot be walked would otherwise pass as one with no files,
    // and a `nav.json` in it would go unvalidated to a build that drops bad entries silently.
    let contentTree: Directory | null = null;
    if (contentDirectory !== null) {
      try {
        contentTree = await this.fileService.getDirectory(contentDirectory);
      } catch {
        return err({ kind: 'unreadableContent' });
      }
    }

    const contentPages = contentTree === null ? [] : PortalSourceContext.contentPages(contentTree);

    // Refused before the navigation scan, which would otherwise answer an entry naming such a
    // page as if it were an ordinary one. In the build, the user's page and the generated one
    // would compete for the address.
    const reserved = PortalSourceContext.reservedAddressPages(contentPages);
    if (reserved.length > 0) {
      return err({ kind: 'reservedAddresses', pages: reserved });
    }

    // Validated here rather than in the template: Fumadocs drops an entry it cannot resolve
    // without a word, so a typo would otherwise reach the user as a quietly wrong sidebar.
    const navigation = await this.navigation(contentTree, specs);
    if (navigation.errors.length > 0) {
      return err({ kind: 'invalidNavigation', errors: navigation.errors });
    }

    return ok({
      ...settings.value,
      suggestedSite: suggested,
      specs,
      contentDirectory,
      staticDirectory,
      shadowedFiles: staticDirectory === null ? [] : await this.shadowedFiles(staticDirectory),
      hiddenPages: PortalSourceContext.hiddenPages(contentPages, specs),
      ignoredNavigationFiles: navigation.ignoredFiles
    });
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
      const file = asset.resolveIn(this.sourceDirectory);
      const found = await this.fileService.spelledOnDisk(this.sourceDirectory, file);
      if (!found?.isEqual(file)) {
        missing.push({ setting: asset.settingPath(), file, foundAs: found });
      }
    }
    return missing;
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
    const fileName = (await this.specDirectoryFileNames()).find((name) =>
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
   * Every `nav.json` in the content tree, validated against the directory it orders, plus
   * any `nav.json` in a case the build does not match. One walk, because both come from the
   * same tree, and a directory has to be seen before its file can be checked against it.
   */
  private async navigation(contentTree: Directory | null, specs: PortalSpec[]): Promise<NavigationScan> {
    if (contentTree === null) {
      return { errors: [], ignoredFiles: [] };
    }

    const ignoredFiles: FilePath[] = [];

    // Children first, because a directory counts as one of its parent's children only when
    // a page sits somewhere beneath it, and the walk below already has to find out. Each
    // directory's errors go ahead of its children's, so the report still reads top down.
    const visit = async (
      directory: Directory,
      isContentRoot: boolean,
      isApiDirectory: boolean,
      isTopLevel: boolean
    ): Promise<DirectoryScan> => {
      const childNames: string[] = [];
      const pageNames = new Set<string>();
      const childErrors: string[] = [];
      let holdsPage = false;
      let navigationFile: FileName | undefined;

      for (const item of directory.items) {
        // A directory with no page anywhere beneath it becomes no node in the page tree, so
        // naming it would resolve to nothing. Fumadocs would build one for a directory that
        // holds only a `nav.json`, but the template drops it again to keep to this rule.
        if (item instanceof Directory) {
          const isApiChild = isContentRoot && item.directoryPath.leafName() === API_REFERENCE_NAME;
          const child = await visit(item, false, isApiChild, isContentRoot);
          childErrors.push(...child.errors);
          if (child.holdsPage) {
            holdsPage = true;
            // The reference's own directory is listed below instead: it is a child of the
            // content root whether or not the user keeps pages in it.
            if (!isApiChild) {
              childNames.push(item.directoryPath.leafName());
            }
          }
          continue;
        }
        // `compare` is by code point, so this matches the build's glob exactly. A file named
        // `Nav.json` is read by neither, and is reported rather than left sitting inert.
        if (item.fileName.compare(NAVIGATION_FILE) === 0) {
          navigationFile = item.fileName;
          continue;
        }
        if (item.fileName.is(NAVIGATION_FILE_NAME)) {
          ignoredFiles.push(new FilePath(directory.directoryPath, item.fileName));
          continue;
        }
        // An entry addresses a page by the name it is reached at, which is the file name
        // without its extension -- the same way the content source derives a slug.
        const pageName = PortalSourceContext.pageName(item.fileName);
        if (pageName !== undefined) {
          childNames.push(pageName);
          pageNames.add(pageName);
          holdsPage = true;
        }
      }

      // The reference is mounted at `content/api` whether or not a directory is there to see,
      // so it is a child of the content root in every portal. Listed unconditionally, so one
      // entry gets one answer whatever else shares the directory: without this, the same
      // mistake read as "not a page or folder" in a project with no such directory and as the
      // mount point in a project with one. A page of that name is a second child, and the
      // clash is what says it can never be positioned.
      if (isContentRoot) {
        childNames.push(API_REFERENCE_NAME);
      }

      // The reference pages are mounted in this directory, one folder per specification, and
      // its `nav.json` positions those folders like any other child of its own.
      // A directory of the same name is that very folder, so it is not listed twice; a page
      // of the same name is a second child, and listed again so the validator sees the clash.
      if (isApiDirectory) {
        for (const spec of specs) {
          if (!childNames.includes(spec.slug) || pageNames.has(spec.slug)) {
            childNames.push(spec.slug);
          }
        }
      }

      const errors: string[] = [];
      if (navigationFile !== undefined) {
        const file = new FilePath(directory.directoryPath, navigationFile);
        const label = file.relativeTo(this.sourceDirectory);
        // Read inside the walk, so one unreadable file is reported rather than thrown out of
        // `resolve`, which always answers with a Result.
        let contents: string | undefined;
        try {
          contents = await this.fileService.getContents(file);
        } catch {
          errors.push(`${label} could not be read.`);
        }
        // An empty file goes through too: the build parses it as JSON and fails on it, so the
        // CLI has to refuse it here rather than treat it as no file.
        if (contents !== undefined) {
          // The reference's own directory is a folder in the sidebar however few pages the
          // user keeps in it, because the specification sections are mounted there.
          const becomesFolder = holdsPage || isApiDirectory;
          const checked = PortalNavigation.validate(contents, {
            label,
            isContentRoot,
            isTopLevel,
            isApiDirectory,
            becomesFolder,
            childNames
          });
          if (checked.isErr()) {
            errors.push(...checked.error);
          }
        }
      }

      return { holdsPage, errors: [...errors, ...childErrors] };
    };

    const root = await visit(contentTree, true, false, false);
    return { errors: root.errors, ignoredFiles };
  }

  /**
   * The name an entry addresses a page by, or undefined when the file is not a page. Matched
   * by code point, like the docs glob: `Guide.MD` is no more a page to the build than here.
   */
  private static pageName(fileName: FileName): string | undefined {
    return PAGE_EXTENSIONS.some((extension) => fileName.hasExactExtension(extension))
      ? `${fileName.withoutExtension()}`
      : undefined;
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

  /**
   * Pages inside a specification's section, below `content/api/<slug>/`. The section and each
   * tag folder come with generated metadata that lists only the reference pages, and metadata
   * hides whatever it does not name, so these pages never reach the sidebar. Reported rather
   * than refused: the build still succeeds, and the fix is to move the page.
   *
   * Judged by the directories as written, not by the address: the page tree is keyed on the
   * path, so `content/API/<slug>/` or a `(group)` folder on the way is a different folder that
   * no metadata hides. An `index` page is a folder's own link rather than one of its pages, so
   * the section's is shown, and so is one in a folder directly below it: that is where the tag
   * folders sit, and the CLI cannot tell a tag folder from one the user made without reading
   * the specification's tags, so it stays quiet rather than warn about a page that is shown.
   */
  private static hiddenPages(pages: ContentPage[], specs: PortalSpec[]): FilePath[] {
    const slugs = new Set(specs.map((spec) => spec.slug));
    return pages
      .filter(({ segments }) => {
        const [first, second, ...rest] = segments;
        if (first !== API_REFERENCE_NAME || !slugs.has(second) || rest.length === 0) {
          return false;
        }
        const isFolderIndex =
          rest.length <= 2 && PortalSourceContext.pageName(new FileName(rest[rest.length - 1])) === INDEX_NAME;
        return !isFolderIndex;
      })
      .map(({ file }) => file);
  }

  /**
   * Pages served at a generated section's address or below it, whether or not `apimatic.json`
   * calls for the section. Judged by the address, as the content source computes it, rather
   * than by the directories as written: a page in a `(group)` folder is served as if the folder
   * were not there, and a folder's index page at the folder's own address.
   */
  private static reservedAddressPages(pages: ContentPage[]): ReservedAddressPage[] {
    return pages.flatMap(({ file, segments }) => {
      const slugs = PortalSourceContext.slugs(segments);
      const section = GENERATED_SECTIONS.find((candidate) => candidate.folder === slugs[0]);
      return section === undefined ? [] : [{ file, address: `/${slugs.join('/')}`, section }];
    });
  }

  private static slugs(segments: string[]): string[] {
    const folders = segments.slice(0, -1).filter((segment) => !GROUP_FOLDER.test(segment));
    const name = PortalSourceContext.pageName(new FileName(segments[segments.length - 1]));
    return name === undefined || name === INDEX_NAME ? folders : [...folders, name];
  }

  private static contentPages(contentTree: Directory): ContentPage[] {
    return contentTree
      .getAllFiles()
      .filter((file) => PortalSourceContext.pageName(file.name()) !== undefined)
      .map((file) => ({ file, segments: file.relativeTo(contentTree.directoryPath).split('/') }));
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

    const fileNames = await this.specDirectoryFileNames();
    if (fileNames.length === 0) {
      return err({ kind: 'emptySpecDirectory' });
    }

    const documentNames = fileNames.filter((name) => SPEC_EXTENSIONS.some((extension) => name.hasExtension(extension)));
    for (const fileName of documentNames) {
      const file = new FilePath(this.specDirectory, fileName);
      const document = await this.readDocument(file);
      if (document === undefined) {
        return err({ kind: 'unreadableSpec', fileName });
      }
      if (!document.format().supported) {
        continue;
      }

      specs.push({ slug: this.uniqueSlug(fileName, usedSlugs), file, endpoints: await this.endpoints(document, file) });
      first ??= document;
    }

    if (first === undefined) {
      return err({ kind: 'noOpenApiSpec' });
    }
    return ok({ specs, suggested: specs.length === 1 ? first.suggestedSite() : null });
  }

  private async specDirectoryFileNames(): Promise<FileName[]> {
    if (!(await this.fileService.directoryExists(this.specDirectory))) {
      return [];
    }
    const directory = await this.fileService.getDirectory(this.specDirectory);
    // Sorted because this order decides which of two names that normalise to the same slug
    // keeps it, and which document becomes the default server.
    return directory.items
      .flatMap((item) => ('fileName' in item ? [item.fileName] : []))
      .sort((left, right) => left.compare(right));
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
