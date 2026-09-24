import { PathUtils } from 'fumadocs-core/source';
import type { ContentStorage, PageTreeTransformer } from 'fumadocs-core/source';
import type { Folder, Node } from 'fumadocs-core/page-tree';
import { apiBaseDir, docsRoute } from './shared';

/**
 * Only what this file needs of the builder context. `loader()` infers a storage type from
 * the exact sources it is given, and the hooks take it as `this`, so depending on the whole
 * context would tie the transformer to one particular set of sources.
 */
interface NavigationStorage {
  read(path: string): { format: string; type?: string; data: unknown } | undefined;
}

interface NavigationBuilder {
  resolveFlattenPath(name: string, format: string): string;
}

interface NavigationContext {
  storage: NavigationStorage;
  builder: NavigationBuilder;
}

/** Everything in this directory that no other entry names. */
const REST_TOKEN = '...';
/** The API reference, positioned as one node. */
const API_REFERENCE_TOKEN = 'apimatic:api';

/**
 * The folders the CLI generates, each a tab of its own, by the token that positions it and in
 * the order they take when the root `nav.json` names none of them. The CLI's
 * `GENERATED_SECTIONS` lists the same, and a test holds the two together.
 */
export const GENERATED_SECTIONS = [
  { token: 'apimatic:sdks', folder: 'sdks' },
  { token: 'apimatic:plugin', folder: 'context-plugin' }
] as const;

const NAVIGATION_FILE_STEM = 'nav';

const INDEX_STEM = 'index';

const API_REFERENCE_TITLE = 'API Reference';

/** Where the home page is served, which is how its node is told apart from every other page. */
const HOME_URL = docsRoute;

/**
 * The tabs no folder backs, which the transformer assembles from loose nodes. Their names are
 * fixed, and so are their ids: React keys and the tree context's tab matching both go by id,
 * and the tree is serialised and rebuilt on its way to the browser. Fumadocs ids a node by its
 * path relative to the content directory, which never starts with a slash, so these cannot be
 * taken by a directory of the same name.
 */
const SYNTHETIC_TABS = {
  home: { $id: '/tab/home', name: 'Home' },
  guides: { $id: '/tab/guides', name: 'Guides' }
} as const;

/** The node the fallback home page gets when there is no index page; see `groupIntoTabs`. */
const SYNTHETIC_HOME_ID = '/page/home';

type SyntheticTab = keyof typeof SYNTHETIC_TABS;

/**
 * The key the generated pages are passed to `loader()` under, which the storage stamps onto
 * every file of that source.
 */
export const GENERATED_SOURCE = 'generated';

/**
 * The key the reference pages are passed to `loader()` under in `source.server.ts`. It tells
 * a specification's section apart from a folder the user made under `content/api/`, which
 * lands in the same virtual directory.
 */
export const OPENAPI_SOURCE = 'openapi';

/**
 * Applies the order in each directory's `nav.json` to the page tree.
 *
 * The hook fires for every directory once its children are built, so this never resolves
 * anything: it permutes a list Fumadocs has already ordered correctly, which is what makes
 * losing a page structurally impossible. Entries that match nothing are ignored rather than
 * reported, because `PortalSourceContext` has already refused a file that contains one.
 */
export function navigationTransformer<S extends ContentStorage>(): PageTreeTransformer<S> {
  return {
    folder(node, folderPath) {
      // A directory holding a `nav.json` and no page still gets a folder node, because the
      // metadata file is in storage. The CLI treats such a directory as no folder, so the
      // parent's file cannot name it; showing it empty would contradict that refusal. A
      // folder whose only page is its index is not empty: the folder itself links to it.
      node.children = node.children.filter((child) => !isEmptyFolder(child));

      // The root is ordered even with no file of its own: naming nothing still puts the
      // generated sections and the API reference at their defaults, and Fumadocs' own order
      // would not. It sorts folders by path, so `api` lands above a user folder called anything
      // later in the alphabet, and a generated folder lands in the middle of the user's pages.
      // Below the root those defaults do not apply, so a folder with no file keeps Fumadocs'
      // order untouched, which is every tag folder of every specification.
      const settings = readSettings(this, folderPath);
      const order = settings?.pages;
      if (folderPath === '' || order !== undefined) {
        node.children = reorder(this, node, folderPath, order ?? []);
      }
      if (folderPath === apiBaseDir) {
        applyApiStructure(this, node);
      }
      // Last, so a name the user wrote outranks both the title Fumadocs takes from an index
      // page and the default the API wrapper is given just above. Never at the content root,
      // which is no folder in the sidebar: Fumadocs names the tree itself from this node, and
      // the CLI refuses a title there, so honouring one would rename the preview and then
      // fail the build -- the disagreement the token checks in `reorder` exist to avoid.
      if (folderPath !== '' && settings?.title !== undefined) {
        node.name = settings.title;
      }
      return node;
    }
  };
}

/**
 * A tab is a root folder, which is how Fumadocs builds a tab bar: a top-level folder whose
 * `nav.json` sets `"root": true` becomes one, as do the API reference and each folder the CLI
 * generates, and the loose nodes are gathered into Home (the index page) and Guides
 * (everything else). The tabs are ordered by where each one's first node sat, except that Home
 * leads when the file does not place the index page itself. Tabs change no address: URLs come
 * from slugs.
 *
 * Fumadocs never reads `root` itself: it takes a folder's metadata from `meta.json`, which the
 * content collection does not load. So only this decides which folders become tabs, which is
 * also what keeps a `root` the CLI refuses, on a nested folder or the reference, from making one.
 */
export function tabsTransformer<S extends ContentStorage>(): PageTreeTransformer<S> {
  return {
    root(root) {
      root.children = groupIntoTabs(this, root.children);
      return root;
    }
  };
}

/** What a directory's `nav.json` says about it. Absent fields leave Fumadocs' own answer. */
interface NavigationSettings {
  pages: string[] | undefined;
  title: string | undefined;
  /** Only an actual `true` counts: a half-typed value makes no tab. */
  root: boolean;
}

function readSettings(context: NavigationContext, folderPath: string): NavigationSettings | undefined {
  // Resolved through the builder's own index so the extension is never hard-coded.
  const path = context.builder.resolveFlattenPath(PathUtils.joinPath(folderPath, NAVIGATION_FILE_STEM), 'meta');
  const file = context.storage.read(path);
  // `data` is whatever was in the file. The CLI refuses a `nav.json` that is not an object,
  // but only once at startup: during `portal serve` a half-typed file reloads straight to
  // here, and `null` would throw out of the page-tree build.
  if (file === undefined || file.format !== 'meta' || typeof file.data !== 'object' || file.data === null) {
    return undefined;
  }

  const { pages, title, root } = file.data as { pages?: unknown; title?: unknown; root?: unknown };
  // A half-typed title reloads to here as an empty string, which would blank the folder in
  // the sidebar with nothing to click. The CLI refuses one; the preview keeps the default
  // name until the file is worth reading again.
  const named = typeof title === 'string' ? title.trim() : '';
  return {
    pages: Array.isArray(pages) ? pages.filter((entry): entry is string => typeof entry === 'string') : undefined,
    title: named.length > 0 ? named : undefined,
    root: root === true
  };
}

function isTabFolder(context: NavigationContext, folder: Folder): boolean {
  const folderPath = folder.$ref?.folder;
  return folderPath !== undefined && folderPath !== apiBaseDir && readSettings(context, folderPath)?.root === true;
}

function groupIntoTabs(context: NavigationContext, children: Node[]): Node[] {
  const tabs: Folder[] = [];
  const synthetic = new Map<SyntheticTab, Folder>();
  const gather = (kind: SyntheticTab, child: Node): void => {
    let tab = synthetic.get(kind);
    if (tab === undefined) {
      tab = { type: 'folder', ...SYNTHETIC_TABS[kind], root: true, children: [] };
      synthetic.set(kind, tab);
      tabs.push(tab);
    }
    tab.children.push(child);
  };

  for (const child of children) {
    if (
      child.type === 'folder' &&
      (isApiReference(child) || isTabFolder(context, child) || isInjected(context, child))
    ) {
      tabs.push(asTab(child));
    } else if (child.type === 'page' && child.url === HOME_URL) {
      gather('home', child);
    } else {
      gather('guides', child);
    }
  }

  // A project without an index page still gets a home page, rendered by the route, but no
  // node reaches it: it would sit outside every tab and show no tab bar at all. It gets one
  // here -- unless the address is taken deeper down, as by an index page in a `(group)`
  // folder, since the same URL may appear only once in the tree.
  const hasIndexPage = synthetic.has('home');
  if (!hasIndexPage && !containsUrl(children, HOME_URL)) {
    gather('home', { type: 'page', $id: SYNTHETIC_HOME_ID, name: SYNTHETIC_TABS.home.name, url: HOME_URL });
  }

  // Fumadocs points a tab at the page with the same path inside the tab being left, when
  // there is one, and finds it through the folders' `$ref`. Between tabs that is the wrong
  // page -- `/api/overview` from `/tutorials/overview` -- so a tab always opens where its
  // own list starts. Nothing past this transformer reads a folder's `$ref`.
  for (const tab of tabs) {
    delete tab.$ref;
  }

  // The home page opens the site, so its tab leads unless the file placed the page itself --
  // which it can only do when there is an index page: without one, an `index` entry names a
  // folder of that name.
  const home = synthetic.get('home');
  if (home !== undefined && !(hasIndexPage && namesIndex(context))) {
    return [home, ...tabs.filter((tab) => tab !== home)];
  }
  return tabs;
}

/**
 * A folder as a tab. Its index page, when it has one, becomes the first of its pages: a root
 * folder's own link is not listed in its sidebar, and Fumadocs does not look there when it
 * decides which tab is active.
 */
function asTab(folder: Folder): Folder {
  folder.root = true;
  if (folder.index !== undefined) {
    folder.children = [folder.index, ...folder.children];
    folder.index = undefined;
  }
  return folder;
}

function namesIndex(context: NavigationContext): boolean {
  return readSettings(context, '')?.pages?.some((entry) => entry.trim() === INDEX_STEM) ?? false;
}

function containsUrl(nodes: Node[], url: string): boolean {
  return nodes.some((node) => {
    if (node.type === 'page') {
      return node.url === url;
    }
    return node.type === 'folder' && (node.index?.url === url || containsUrl(node.children, url));
  });
}

/**
 * Titles the wrapper and, for a single specification, lifts its section away.
 *
 * Fumadocs names an untitled folder by uppercasing its first character only, so `api` would
 * render as "Api", which reads as a typo. The section below it is named after the
 * specification's file, which with one document only restates the portal's own title; with
 * two or more the names tell them apart and are worth a level. Adding a second document
 * therefore inserts a level rather than renaming anything.
 *
 * Only the sections count. Pages the user puts under `content/api/` share this folder, and
 * adding one must not push every operation down a level: the lifted tag folders take the
 * section's place, with those pages staying beside them where the order already put them.
 */
function applyApiStructure(context: NavigationContext, node: Folder): void {
  // A user who gives the folder an index page has named it, as any other folder is named.
  if (node.index === undefined) {
    node.name = API_REFERENCE_TITLE;
  }

  const sections = node.children.filter((child) => isSpecSection(context, child));
  if (sections.length === 1) {
    const [only] = sections;
    // The section's index page, if a user gave it one, sits on the folder rather than among
    // its children, and would be lost with the folder. Lifted first, as Fumadocs itself
    // expands a folder into its index followed by its children.
    const lifted = only.index === undefined ? only.children : [only.index, ...only.children];
    node.children = node.children.flatMap((child) => (child === only ? lifted : [child]));
  }
}

/** Whether a folder holds one specification's reference pages rather than the user's own. */
function isSpecSection(context: NavigationContext, child: Node): child is Folder {
  if (child.type !== 'folder') {
    return false;
  }
  const page = firstPageIn(child);
  return page !== undefined && isFromSource(context, page, OPENAPI_SOURCE);
}

/** The first page beneath a folder, at any depth; a section's pages sit under its tag folders. */
function firstPageIn(folder: Folder): Node | undefined {
  for (const child of folder.children) {
    if (child.type === 'page') {
      return child;
    }
    if (child.type === 'folder') {
      const page = firstPageIn(child);
      if (page !== undefined) {
        return page;
      }
    }
  }
  return undefined;
}

function reorder(context: NavigationContext, node: Folder, folderPath: string, order: string[]): Node[] {
  const remaining = new Set(node.children);
  // Asked once per child: the token, both bands and the anchor all want to know, and each
  // answer is a storage read.
  const injectedChildren = new Set(node.children.filter((child) => isInjected(context, child)));
  const isInjectedChild = (child: Node): boolean => injectedChildren.has(child);
  const named: Node[] = [];
  let restIndex: number | undefined;

  const claim = (child: Node | undefined): void => {
    if (child !== undefined) {
      remaining.delete(child);
      named.push(child);
    }
  };

  // Every token names a node that lives at the content root, and the CLI refuses each one
  // anywhere else. Honouring them in a nested directory would let the two halves of the
  // format disagree about a file only one of them had rejected.
  const isContentRoot = folderPath === '';

  for (const raw of order) {
    const entry = raw.trim();
    const section = GENERATED_SECTIONS.find((candidate) => candidate.token === entry);
    if (entry === REST_TOKEN) {
      restIndex = named.length;
    } else if (entry === API_REFERENCE_TOKEN) {
      if (isContentRoot) {
        claim([...remaining].find((child) => isApiReference(child)));
      }
    } else if (section !== undefined) {
      if (isContentRoot) {
        claim([...remaining].find((child) => isInjectedChild(child) && isSectionFolder(child, section)));
      }
    } else {
      claim(matching(context, [...remaining], folderPath, entry));
    }
  }

  // What is left keeps its default order, in three bands. The generated sections and the API
  // reference have defaults of their own rather than travelling with the content, so that
  // a later release adding a section never splits the band or reorders a sidebar nobody
  // touched. The sections keep the CLI's order: Fumadocs' own is by path, which would put
  // `context-plugin` above `sdks`.
  const rest = [...remaining];
  const api = rest.filter((child) => isApiReference(child));
  const injected = rest.filter(isInjectedChild).sort((left, right) => sectionRank(left) - sectionRank(right));
  const content = rest.filter((child) => !isApiReference(child) && !isInjectedChild(child));

  // With no rest token, unnamed content joins the user's own pages: after the last one the
  // file named. Appending at the end instead would drop it below the whole API reference,
  // and inserting before the reference would lift it above one the file deliberately put
  // first.
  const at = restIndex ?? afterNamedContent(named, isInjectedChild);
  const ordered = [...named.slice(0, at), ...content, ...named.slice(at)];

  // Before the API reference, but never above the user's own pages: when the file puts the
  // reference first, the band follows the content instead.
  const anchor = Math.max(anchorIn(ordered), at + content.length);
  return [...ordered.slice(0, anchor), ...injected, ...ordered.slice(anchor), ...api];
}

/**
 * The child an entry addresses. A page is compared against the virtual path the builder
 * resolves its name to, a folder against its own path, which is why `noRef` has to stay at
 * its default of false. When a page and a folder share the name, the folder wins, as it
 * does for the same entry in Fumadocs' own metadata.
 */
function matching(context: NavigationContext, children: Node[], folderPath: string, entry: string): Node | undefined {
  const target = PathUtils.joinPath(folderPath, entry);
  const folder = children.find((child) => child.type === 'folder' && child.$ref?.folder === target);
  if (folder !== undefined) {
    return folder;
  }
  const pagePath = context.builder.resolveFlattenPath(target, 'page');
  return children.find((child) => child.type === 'page' && child.$ref === pagePath);
}

function afterNamedContent(named: Node[], isInjectedChild: (child: Node) => boolean): number {
  for (let index = named.length - 1; index >= 0; index -= 1) {
    if (!isApiReference(named[index]) && !isInjectedChild(named[index])) {
      return index + 1;
    }
  }
  // Nothing named is the user's own, so everything named is what the CLI adds, and the
  // user's pages keep their default place above all of it.
  return 0;
}

function anchorIn(children: Node[]): number {
  const index = children.findIndex((child) => isApiReference(child));
  return index === -1 ? children.length : index;
}

function isApiReference(child: Node): child is Folder {
  return child.type === 'folder' && child.$ref?.folder === apiBaseDir;
}

function isEmptyFolder(child: Node): boolean {
  return child.type === 'folder' && child.children.length === 0 && child.index === undefined;
}

/**
 * Whether a node came from the generated source rather than the user's content directory. A
 * folder is judged by its index page first: the context plugin's holds nothing else, and
 * `firstPageIn` walks only a folder's children.
 */
function isInjected(context: NavigationContext, child: Node): boolean {
  if (child.type === 'folder') {
    const page = child.index ?? firstPageIn(child);
    return page !== undefined && isFromSource(context, page, GENERATED_SOURCE);
  }
  return isFromSource(context, child, GENERATED_SOURCE);
}

/**
 * Where a generated folder comes in `GENERATED_SECTIONS`. Anything else sorts after them, which
 * only a loose generated page could be, and the CLI writes none.
 */
function sectionRank(child: Node): number {
  const rank = GENERATED_SECTIONS.findIndex((section) => isSectionFolder(child, section));
  return rank === -1 ? GENERATED_SECTIONS.length : rank;
}

function isSectionFolder(child: Node, section: (typeof GENERATED_SECTIONS)[number]): boolean {
  return child.type === 'folder' && child.$ref?.folder === section.folder;
}

/** Whether a page was passed to `loader()` under this key, which the storage stamps on it. */
function isFromSource(context: NavigationContext, child: Node, source: string): boolean {
  if (child.type !== 'page' || child.$ref === undefined) {
    return false;
  }
  return context.storage.read(child.$ref)?.type === source;
}

