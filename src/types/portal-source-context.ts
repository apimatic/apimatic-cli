import { getSlugs } from 'fumadocs-core/source';
import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { Directory } from './file/directory.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { OpenApiDocument } from './portal/openapi-document.js';
import { PortalConfig } from './portal/portal-config.js';
import { IGNORED_NAVIGATION_FILE_NAMES, NAVIGATION_FILE_NAME, PortalNavigation } from './portal/portal-navigation.js';
import { PortalMigration, PortalSource, PortalSourceProblem, PortalSpec } from './portal/portal-source.js';
import { SpecContext } from './spec-context.js';
import { stripByteOrderMark } from '../utils/string-utils.js';

const SPEC_EXTENSIONS = ['.json', '.yaml', '.yml'];

// Empty on purpose: the portal's own routes under /api/ are files with extensions --
// /api/search.json -- so none can collide with a spec section, which is always a directory.
// Pages the user puts under content/api/ can, and `collidingSlugs` reports those.
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

// `generatePortal` settings the v1 `portal.json` can express; everything else in the old
// build file is reported as unsupported by the migration hint.
const MIGRATABLE_PORTAL_FIELDS = new Set(['pageTitle', 'logoUrl', 'tableOfContentsPath']);

const NAVIGATION_FILE = new FileName(NAVIGATION_FILE_NAME);

/** Extensions the docs collection compiles, and so the ones an entry can address. */
const PAGE_EXTENSIONS = ['.md', '.mdx'];

/** What one walk of the content tree found: see `PortalSourceContext.navigation`. */
interface NavigationScan {
  errors: string[];
  ignoredFiles: FilePath[];
}

/** A page in the content tree with the address the content source gives it. */
interface ContentPage {
  file: FilePath;
  address: string[];
}

/** The first segment of every reference page's address, and of a content page that shares it. */
const API_SEGMENT = 'api';

/** What the walk found in one directory and everything beneath it. */
interface DirectoryScan {
  /** Whether a page sits anywhere beneath it, which is what makes it a folder in the sidebar. */
  holdsPage: boolean;
  errors: string[];
}

/**
 * The `src/` directory of a portal project: `portal.json`, the OpenAPI documents in
 * `spec/`, and the optional `content/` and `static/` directories.
 */
export class PortalSourceContext {
  private readonly fileService = new FileService();

  constructor(private readonly sourceDirectory: DirectoryPath) {}

  private get configFile(): FilePath {
    return new FilePath(this.sourceDirectory, new FileName('portal.json'));
  }

  private get legacyBuildFile(): FilePath {
    return new FilePath(this.sourceDirectory, new FileName('APIMATIC-BUILD.json'));
  }

  private get specDirectory(): DirectoryPath {
    return this.sourceDirectory.join('spec');
  }

  private get contentDirectory(): DirectoryPath {
    return this.sourceDirectory.join('content');
  }

  private get staticDirectory(): DirectoryPath {
    return this.sourceDirectory.join('static');
  }

  /** Reads and validates the whole source directory, or reports the first problem found. */
  public async resolve(): Promise<Result<PortalSource, PortalSourceProblem>> {
    if (!(await this.fileService.fileExists(this.configFile))) {
      return err({ kind: 'missingConfig', migration: await this.migration() });
    }

    const config = PortalConfig.parse(await this.fileService.getContents(this.configFile));
    if (config.isErr()) {
      return err({ kind: 'invalidConfig', errors: config.error });
    }

    // `parse` checks the shape of `logo`, not that the file is there -- and a missing logo
    // renders as a broken image on every page of a build that otherwise reports success.
    const logoPath = config.value.logoPath();
    if (logoPath !== null && !(await this.fileService.fileExists(this.resolveInSource(logoPath)))) {
      return err({ kind: 'missingLogo', logoPath });
    }

    const specs = await this.specs();
    if (specs.isErr()) {
      return err(specs.error);
    }

    const staticDirectory = (await this.fileService.directoryExists(this.staticDirectory))
      ? this.staticDirectory
      : null;
    const contentDirectory = (await this.fileService.directoryExists(this.contentDirectory))
      ? this.contentDirectory
      : null;

    // Walked once and shared: both the navigation scan and the slug collision check read the
    // whole content tree, and `getDirectory` stats every entry in it.
    const contentTree = contentDirectory === null ? null : await this.contentTree(contentDirectory);

    // Validated here rather than in the template: Fumadocs drops an entry it cannot resolve
    // without a word, so a typo would otherwise reach the user as a quietly wrong sidebar.
    const navigation = await this.navigation(contentTree);
    if (navigation.errors.length > 0) {
      return err({ kind: 'invalidNavigation', errors: navigation.errors });
    }

    return ok({
      config: config.value,
      specs: specs.value,
      contentDirectory,
      staticDirectory,
      shadowedFiles: staticDirectory === null ? [] : await this.shadowedFiles(staticDirectory),
      collidingSlugs: contentTree === null ? [] : this.collidingSlugs(contentTree, specs.value),
      hiddenPages: contentTree === null ? [] : this.hiddenPages(contentTree, specs.value),
      ignoredNavigationFiles: navigation.ignoredFiles
    });
  }

  /**
   * Writes the smallest source tree `portal generate` and `portal serve` accept, with a
   * `portal.json` described from the specification itself.
   */
  public async scaffold(specPath: FilePath): Promise<void> {
    await new SpecContext(this.specDirectory).install(specPath);

    const config = await this.suggestedConfig(specPath);
    await this.fileService.writeContents(this.configFile, JSON.stringify(config, null, 2) + '\n');

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
  }

  // A split specification arrives as an archive, whose parts are left to the build to read.
  private async suggestedConfig(specPath: FilePath): Promise<PortalConfig> {
    if (await this.fileService.isZipFile(specPath)) {
      return PortalConfig.placeholder;
    }
    const document = await this.readDocument(specPath);
    return document === undefined ? PortalConfig.placeholder : document.suggestedConfig();
  }

  /** A `/`-separated path relative to `src/`, as `PortalConfig` reports it, as a file path. */
  private resolveInSource(relativePath: string): FilePath {
    const segments = relativePath.split('/');
    const fileName = new FileName(segments.pop() ?? '');
    return new FilePath(
      segments.reduce((directory, segment) => directory.join(segment), this.sourceDirectory),
      fileName
    );
  }

  /**
   * Every `nav.json` in the content tree, validated against the directory it orders, plus
   * the `meta.json` files the build no longer reads. One walk, because both come from the
   * same tree, and a directory has to be seen before its file can be checked against it.
   */
  private async navigation(contentTree: Directory | null): Promise<NavigationScan> {
    if (contentTree === null) {
      return { errors: [], ignoredFiles: [] };
    }

    const ignoredFiles: FilePath[] = [];

    // Children first, because a directory counts as one of its parent's children only when
    // a page sits somewhere beneath it, and the walk below already has to find out. Each
    // directory's errors go ahead of its children's, so the report still reads top down.
    const visit = async (directory: Directory, isContentRoot: boolean): Promise<DirectoryScan> => {
      const childNames: string[] = [];
      const childErrors: string[] = [];
      let holdsPage = false;
      let navigationFile: FileName | undefined;

      for (const item of directory.items) {
        // A directory with no page anywhere beneath it becomes no node in the page tree, so
        // naming it would resolve to nothing. Fumadocs would build one for a directory that
        // holds only a `nav.json`, but the template drops it again to keep to this rule.
        if (item instanceof Directory) {
          const child = await visit(item, false);
          childErrors.push(...child.errors);
          if (child.holdsPage) {
            childNames.push(item.directoryPath.leafName());
            holdsPage = true;
          }
          continue;
        }
        // `compare` is by code point, so this matches the build's glob exactly. A file named
        // `Nav.json` is read by neither, and is reported below rather than sitting inert.
        if (item.fileName.compare(NAVIGATION_FILE) === 0) {
          navigationFile = item.fileName;
          continue;
        }
        if (IGNORED_NAVIGATION_FILE_NAMES.some((name) => item.fileName.is(name))) {
          ignoredFiles.push(new FilePath(directory.directoryPath, item.fileName));
          continue;
        }
        // An entry addresses a page by the name it is reached at, which is the file name
        // without its extension -- the same way the content source derives a slug.
        const pageName = PortalSourceContext.pageName(item.fileName);
        if (pageName !== undefined) {
          childNames.push(pageName);
          holdsPage = true;
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
          const parsed = PortalNavigation.parse(contents, { label, isContentRoot, childNames });
          if (parsed.isErr()) {
            errors.push(...parsed.error);
          }
        }
      }

      return { holdsPage, errors: [...errors, ...childErrors] };
    };

    const root = await visit(contentTree, true);
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

  /** The content tree, or null when it cannot be walked, as `contentAddresses` also allowed. */
  private async contentTree(contentDirectory: DirectoryPath): Promise<Directory | null> {
    try {
      return await this.fileService.getDirectory(contentDirectory);
    } catch {
      return null;
    }
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
   * Each specification is mounted at `/api/<slug>`, and a content page whose address is
   * exactly that -- `content/api/<slug>.md`, `content/api/<slug>/index.md`, either inside a
   * `(group)` folder -- takes the same place in the merged loader, which keeps one of the two
   * without a word. Compared without regard to case: the prerender writes both pages to one
   * path on a case-insensitive disk.
   */
  private collidingSlugs(contentTree: Directory, specs: PortalSpec[]): string[] {
    const claimed = new Set<string>();
    for (const { address } of this.contentPages(contentTree)) {
      if (address.length === 2 && address[0].toLowerCase() === API_SEGMENT) {
        claimed.add(address[1].toLowerCase());
      }
    }
    return specs.map((spec) => spec.slug).filter((slug) => claimed.has(slug.toLowerCase()));
  }

  /**
   * Pages inside a specification's section, below `content/api/<slug>/`. The section and each
   * tag folder come with generated metadata that lists only the reference pages, and metadata
   * hides whatever it does not name, so these pages never reach the sidebar. Reported rather
   * than refused: the build still succeeds, and the fix is to move the page.
   */
  private hiddenPages(contentTree: Directory, specs: PortalSpec[]): FilePath[] {
    const slugs = new Set(specs.map((spec) => spec.slug.toLowerCase()));
    return this.contentPages(contentTree)
      .filter(
        ({ address }) =>
          address.length > 2 && address[0].toLowerCase() === API_SEGMENT && slugs.has(address[1].toLowerCase())
      )
      .map(({ file }) => file);
  }

  // The content source's own slug rules rather than a second implementation of them:
  // `(group)` folders drop out and `index` collapses into its parent.
  private contentPages(contentTree: Directory): ContentPage[] {
    return contentTree
      .getAllFiles()
      .filter((file) => PortalSourceContext.pageName(file.name()) !== undefined)
      .map((file) => ({ file, address: getSlugs(file.relativeTo(contentTree.directoryPath)) }));
  }

  private async specs(): Promise<Result<PortalSpec[], PortalSourceProblem>> {
    const specs: PortalSpec[] = [];
    const usedSlugs = new Set<string>(RESERVED_SPEC_SLUGS);

    for (const fileName of await this.specFileNames()) {
      const file = new FilePath(this.specDirectory, fileName);
      const document = await this.readDocument(file);
      if (document === undefined) {
        return err({ kind: 'unreadableSpec', fileName });
      }

      // A document without a version key is not a spec at all (APIMATIC-META.json, a `$ref`
      // target); those are skipped silently. A recognisable but unsupported format is named.
      const format = document.format();
      if (!format.supported) {
        if (format.format === null) {
          continue;
        }
        return err({ kind: 'unsupportedSpec', fileName, format: format.format });
      }

      specs.push({ slug: this.uniqueSlug(fileName, usedSlugs), file });
    }

    if (specs.length === 0) {
      return err({ kind: 'noSpecs' });
    }
    return ok(specs);
  }

  private async specFileNames(): Promise<FileName[]> {
    if (!(await this.fileService.directoryExists(this.specDirectory))) {
      return [];
    }
    const directory = await this.fileService.getDirectory(this.specDirectory);
    // Sorted because this order decides which of two names that normalise to the same slug
    // keeps it, and which document becomes the default server.
    return directory.items
      .flatMap((item) => ('fileName' in item ? [item.fileName] : []))
      .filter((fileName) => SPEC_EXTENSIONS.some((extension) => fileName.hasExtension(extension)))
      .sort((left, right) => left.compare(right));
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

  /** What a pre-2.0 build file offers towards a `portal.json`, or null when there is none. */
  private async migration(): Promise<PortalMigration | null> {
    if (!(await this.fileService.fileExists(this.legacyBuildFile))) {
      return null;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(stripByteOrderMark(await this.fileService.getContents(this.legacyBuildFile)));
    } catch {
      return null;
    }

    const portal = data.generatePortal;
    const versionedPortal = data.generateVersionedPortal;
    if (typeof portal !== 'object' || portal === null) {
      return versionedPortal === undefined
        ? null
        : {
            suggestedConfig: PortalConfig.placeholder,
            unsupportedFields: ['generateVersionedPortal'],
            unmigratableLogo: null,
            hadTableOfContents: false
          };
    }

    const portalFields = portal as Record<string, unknown>;
    // Both fields come from a file the CLI has never validated, so each is held to what
    // `PortalConfig.parse` accepts before it reaches the trusted factory.
    const pageTitle = typeof portalFields.pageTitle === 'string' ? portalFields.pageTitle.trim() : '';
    const title = pageTitle.length > 0 ? pageTitle : PortalConfig.placeholder.siteTitle();

    const logoUrl = typeof portalFields.logoUrl === 'string' ? portalFields.logoUrl : null;
    const logo = logoUrl !== null && PortalConfig.isValidLogo(logoUrl) ? logoUrl : null;

    const unsupportedFields = Object.keys(portalFields)
      .filter((field) => !MIGRATABLE_PORTAL_FIELDS.has(field))
      .sort((a, b) => a.localeCompare(b));
    if (versionedPortal !== undefined) {
      unsupportedFields.push('generateVersionedPortal');
    }

    return {
      suggestedConfig: PortalConfig.create(title, null, logo),
      unsupportedFields,
      unmigratableLogo: logoUrl !== null && logo === null ? logoUrl : null,
      hadTableOfContents: portalFields.tableOfContentsPath !== undefined
    };
  }
}
