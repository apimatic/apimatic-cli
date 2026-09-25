import { getSlugs } from 'fumadocs-core/source/plugins/slugs';
import { err, ok, Result } from 'neverthrow';
import { Directory } from '../file/directory.js';
import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';
import { ContentNotices } from './content-notices.js';
import { GENERATED_SECTIONS, GeneratedPages } from './generated-pages.js';
import { parsePageFrontMatter } from './page-front-matter.js';
import {
  API_REFERENCE_NAME,
  GROUP_FOLDER,
  INDEX_NAME,
  NAVIGATION_FILE_NAME,
  NavigationSettings,
  PortalNavigation
} from './portal-navigation.js';
import { ContentProblem, PortalSpec, ReservedAddressPage, SharedAddress } from './portal-source.js';
import { PortalTab, sharedTabNames, TabOwner, untitledTabName } from './portal-tabs.js';

const NAVIGATION_FILE = new FileName(NAVIGATION_FILE_NAME);

/** Extensions the docs collection compiles, and so the ones an entry can address. */
const PAGE_EXTENSIONS = ['.md', '.mdx'];

/** Passed over by Vite's `import.meta.glob`, which the build reads the content through. */
export const isSkippedByGlob = (name: string) => name.startsWith('.') || name === 'node_modules';

/** A file of the tree with what it holds, or undefined when it could not be read. */
export interface ContentFile {
  file: FilePath;
  contents: string | undefined;
}

/** A page in the content tree, with its path from the content directory split into segments. */
interface ContentPage {
  file: FilePath;
  segments: string[];
}

/** A page whose front matter the build accepts, with the title it names the page by. */
interface TitledPage {
  file: FilePath;
  title: string;
}

/** A `nav.json` the walk found valid, with what it says. */
interface CheckedNavigation {
  file: FilePath;
  settings: NavigationSettings;
}

/** What the walk found in one directory and everything beneath it. */
interface DirectoryScan {
  /** Whether a page sits anywhere beneath it, which is what makes it a folder in the sidebar. */
  holdsPage: boolean;
  /** Whether a page beneath it is served at its own address: its index page, or a `(group)`'s. */
  servesOwnAddress: boolean;
  navigation: CheckedNavigation | undefined;
  indexPage: FilePath | undefined;
  /** Its subfolders that are folders in the sidebar, by name, and at the content root its `api`. */
  subfolders: Map<string, { directory: DirectoryPath; scan: DirectoryScan }>;
  errors: string[];
}

/** What one walk of the tree found: every `nav.json` checked, and any in a case the build ignores. */
interface NavigationScan {
  root: DirectoryScan;
  ignoredFiles: FilePath[];
}

/**
 * The `content/` directory of a portal source, held to the rules the build reads it by. It reads
 * nothing itself: `pages` and `navigationFiles` name what `check` needs to be handed.
 */
export class ContentTree {
  constructor(
    private readonly tree: Directory,
    /** What each file is named relative to, in the messages. */
    private readonly sourceDirectory: DirectoryPath
  ) {}

  /** The pages the build compiles. */
  public pages(): FilePath[] {
    return this.contentPages().map(({ file }) => file);
  }

  /** The `nav.json` files the build reads, which its glob matches by code point. */
  public navigationFiles(): FilePath[] {
    return this.tree
      .getAllFiles()
      .filter((file) => file.name().compare(NAVIGATION_FILE) === 0 && !this.isSkipped(file));
  }

  /**
   * Every problem the build would refuse the tree for, or what it accepts but the user should
   * hear of. `pages` and `navigationFiles` hold what was read of the files named by the methods
   * of the same names.
   */
  public async check(
    read: { pages: ContentFile[]; navigationFiles: ContentFile[] },
    specs: PortalSpec[],
    generatedPages: GeneratedPages
  ): Promise<Result<ContentNotices, ContentProblem[]>> {
    const pages = this.contentPages();
    const addressProblems = ContentTree.addressProblems(pages);

    // The build fails as a whole, with a stack trace, over one page whose front matter it refuses.
    const { titled, errors: frontMatterErrors } = await this.titledPages(read.pages);
    const problems: ContentProblem[] =
      frontMatterErrors.length > 0 ? [{ kind: 'invalidFrontMatter', errors: frontMatterErrors }] : [];

    // The walk takes each page to be served where it sits, so it would misjudge an entry naming one of these.
    if (addressProblems.length > 0) {
      return err([...addressProblems, ...problems]);
    }

    // Validated here rather than in the template: Fumadocs drops an entry it cannot resolve
    // without a word, so a typo would otherwise reach the user as a quietly wrong sidebar.
    const navigation = this.navigation(read.navigationFiles, specs);
    if (navigation.root.errors.length > 0) {
      problems.push({ kind: 'invalidNavigation', errors: navigation.root.errors });
    }
    if (problems.length > 0) {
      return err(problems);
    }

    const tabs = ContentTree.tabs(navigation.root, titled, generatedPages);
    return ok({
      hiddenPages: ContentTree.hiddenPages(pages, specs),
      ignoredNavigationFiles: navigation.ignoredFiles,
      folderTabs: tabs.flatMap(({ owner }) => (owner.kind === 'folder' ? [owner.directory] : [])),
      sharedTabNames: sharedTabNames(tabs)
    });
  }

  private contentPages(): ContentPage[] {
    return this.tree
      .getAllFiles()
      .filter((file) => ContentTree.pageName(file.name()) !== undefined && !this.isSkipped(file))
      .map((file) => ({ file, segments: file.relativeTo(this.tree.directoryPath).split('/') }));
  }

  private isSkipped(file: FilePath): boolean {
    return file.relativeTo(this.tree.directoryPath).split('/').some(isSkippedByGlob);
  }

  /** Every page the build accepts with its title, and what it would refuse in the front matter of the rest. */
  private async titledPages(pages: ContentFile[]): Promise<{ titled: TitledPage[]; errors: string[] }> {
    const read = await Promise.all(
      pages.map(async ({ file, contents }) => {
        const label = file.relativeTo(this.sourceDirectory);
        const frontMatter =
          contents === undefined ? err([`${label} could not be read.`]) : await parsePageFrontMatter(contents, label);
        return frontMatter.map(({ title }): TitledPage => ({ file, title }));
      })
    );
    return {
      titled: read.flatMap((page) => (page.isOk() ? [page.value] : [])),
      errors: read.flatMap((page) => (page.isErr() ? page.error : []))
    };
  }

  /**
   * Every `nav.json` in the tree, validated against the directory it orders, plus any `nav.json`
   * in a case the build does not match. One walk, because both come from the same tree, and a
   * directory has to be seen before its file can be checked against it.
   */
  private navigation(navigationFiles: ContentFile[], specs: PortalSpec[]): NavigationScan {
    const ignoredFiles: FilePath[] = [];

    // Children first, because a directory counts as one of its parent's children only when
    // a page sits somewhere beneath it, and the walk below already has to find out. Each
    // directory's errors go ahead of its children's, so the report still reads top down.
    const visit = (directory: Directory, isContentRoot: boolean, isApiDirectory: boolean): DirectoryScan => {
      const childNames: string[] = [];
      const pageNames = new Set<string>();
      const childErrors: string[] = [];
      const subfolders: DirectoryScan['subfolders'] = new Map();
      const foldersServingThisAddress: string[] = [];
      const emptyFolders: string[] = [];
      let holdsPage = false;
      let navigationFile: FileName | undefined;
      let indexPage: FilePath | undefined;

      for (const item of directory.items) {
        if (isSkippedByGlob(item instanceof Directory ? item.directoryPath.leafName() : item.fileName.toString())) {
          continue;
        }
        // A directory with no page anywhere beneath it becomes no node in the page tree, so
        // naming it would resolve to nothing. Fumadocs would build one for a directory that
        // holds only a `nav.json`, but the template drops it again to keep to this rule.
        if (item instanceof Directory) {
          const name = item.directoryPath.leafName();
          const isApiChild = isContentRoot && name === API_REFERENCE_NAME;
          const child = visit(item, false, isApiChild);
          childErrors.push(...child.errors);
          if (child.servesOwnAddress && GROUP_FOLDER.test(name)) {
            foldersServingThisAddress.push(name);
          }
          if (child.holdsPage || isApiChild) {
            subfolders.set(name, { directory: item.directoryPath, scan: child });
          }
          if (child.holdsPage) {
            holdsPage = true;
            // The reference's own directory is listed below instead: it is a child of the
            // content root whether or not the user keeps pages in it.
            if (!isApiChild) {
              childNames.push(name);
            }
          } else if (!isApiChild) {
            emptyFolders.push(name);
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
        const pageName = ContentTree.pageName(item.fileName);
        if (pageName !== undefined) {
          childNames.push(pageName);
          pageNames.add(pageName);
          holdsPage = true;
          if (pageName === INDEX_NAME) {
            indexPage ??= new FilePath(directory.directoryPath, item.fileName);
          }
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
      let navigation: CheckedNavigation | undefined;
      if (navigationFile !== undefined) {
        const file = new FilePath(directory.directoryPath, navigationFile);
        const label = file.relativeTo(this.sourceDirectory);
        const contents = navigationFiles.find((read) => read.file.isEqual(file))?.contents;
        // An empty file goes through too: the build parses it as JSON and fails on it, so the
        // CLI has to refuse it here rather than treat it as no file.
        if (contents === undefined) {
          errors.push(`${label} could not be read.`);
        } else {
          // The reference's own directory is a folder in the sidebar however few pages the
          // user keeps in it, because the specification sections are mounted there.
          const becomesFolder = holdsPage || isApiDirectory;
          const checked = PortalNavigation.validate(contents, {
            label,
            isContentRoot,
            isApiDirectory,
            becomesFolder,
            childNames,
            emptyFolders,
            // At the content root, the address such a folder serves is the home page's.
            homePageFolders: isContentRoot ? foldersServingThisAddress : []
          });
          if (checked.isErr()) {
            errors.push(...checked.error);
          } else {
            navigation = { file, settings: checked.value };
          }
        }
      }

      const servesOwnAddress = indexPage !== undefined || foldersServingThisAddress.length > 0;
      return { holdsPage, servesOwnAddress, navigation, indexPage, subfolders, errors: [...errors, ...childErrors] };
    };

    return { root: visit(this.tree, true, false), ignoredFiles };
  }

  /**
   * Every tab, named as the template names it, in the order a report lists them: Home, the
   * folders the root `nav.json` lists, the generated sections, then the API reference.
   */
  private static tabs(root: DirectoryScan, pages: TitledPage[], generatedPages: GeneratedPages): PortalTab[] {
    const named = (owner: TabOwner, scan: DirectoryScan | undefined): PortalTab =>
      ContentTree.namedTab(owner, scan?.navigation, scan?.indexPage, pages);

    // The home page is the content root's index page, which names no tab.
    const home = ContentTree.namedTab({ kind: 'home' }, root.navigation, undefined, pages);
    const folders = (root.navigation?.settings.pages ?? []).flatMap((entry) => {
      const subfolder = entry === API_REFERENCE_NAME ? undefined : root.subfolders.get(entry);
      return subfolder === undefined ? [] : [named({ kind: 'folder', directory: subfolder.directory }, subfolder.scan)];
    });
    const generated = generatedPages.sections().map((section) => named({ kind: 'generated', section }, undefined));
    const reference = named({ kind: 'apiReference' }, root.subfolders.get(API_REFERENCE_NAME)?.scan);
    return [home, ...folders, ...generated, reference];
  }

  /** A tab by the name the template gives it: its `nav.json` title, else its index page's. */
  private static namedTab(
    owner: TabOwner,
    navigation: CheckedNavigation | undefined,
    indexPage: FilePath | undefined,
    pages: TitledPage[]
  ): PortalTab {
    if (navigation?.settings.title !== undefined) {
      return { owner, name: navigation.settings.title, namedBy: navigation.file };
    }
    const index = indexPage === undefined ? undefined : pages.find((page) => page.file.isEqual(indexPage));
    if (index !== undefined) {
      return { owner, name: index.title, namedBy: index.file };
    }
    return { owner, name: untitledTabName(owner), namedBy: null };
  }

  /**
   * Pages the build cannot serve where they are, each refused for one reason: a page with no
   * address is not judged by one, and one at an address kept for the generated pages is not
   * said to share it as well.
   */
  private static addressProblems(pages: ContentPage[]): ContentProblem[] {
    const problems: ContentProblem[] = [];

    // Fumadocs throws on one: a `(group)` name is left out of every address, so it has none.
    const groupNamed = pages.filter(({ file }) => GROUP_FOLDER.test(ContentTree.pageName(file.name()) ?? ''));
    if (groupNamed.length > 0) {
      problems.push({ kind: 'groupNamedPages', pages: groupNamed.map(({ file }) => file) });
    }
    const addressed = pages.filter((page) => !groupNamed.includes(page));

    // In the build, the user's page and the generated one would compete for the address.
    const reserved = ContentTree.reservedAddressPages(addressed);
    if (reserved.length > 0) {
      problems.push({ kind: 'reservedAddresses', pages: reserved });
    }

    // The build fails on two pages at one address, or moves an index page to `<folder>/index`.
    const shared = ContentTree.sharedAddresses(
      addressed.filter(({ file }) => !reserved.some((page) => page.file.isEqual(file)))
    );
    if (shared.length > 0) {
      problems.push({ kind: 'sharedAddresses', addresses: shared });
    }
    return problems;
  }

  /**
   * Pages served at a generated section's address or below it, whether or not `apimatic.json`
   * calls for the section. Judged by the address, as the content source computes it, rather
   * than by the directories as written: a page in a `(group)` folder is served as if the folder
   * were not there, and a folder's index page at the folder's own address.
   */
  private static reservedAddressPages(pages: ContentPage[]): ReservedAddressPage[] {
    return pages.flatMap(({ file, segments }) => {
      const slugs = getSlugs(segments.join('/'));
      const section = GENERATED_SECTIONS.find((candidate) => candidate.folder === slugs[0]);
      return section === undefined ? [] : [{ file, address: `/${slugs.join('/')}`, section }];
    });
  }

  /** Addresses more than one page would be served at, each with its pages in the order walked. */
  private static sharedAddresses(pages: ContentPage[]): SharedAddress[] {
    const byAddress = new Map<string, FilePath[]>();
    for (const { file, segments } of pages) {
      const address = `/${getSlugs(segments.join('/')).join('/')}`;
      byAddress.set(address, [...(byAddress.get(address) ?? []), file]);
    }
    return [...byAddress]
      .filter(([, files]) => files.length > 1)
      .map(([address, files]) => ({ address, pages: files }));
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
          rest.length <= 2 && ContentTree.pageName(new FileName(rest[rest.length - 1])) === INDEX_NAME;
        return !isFolderIndex;
      })
      .map(({ file }) => file);
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
}
