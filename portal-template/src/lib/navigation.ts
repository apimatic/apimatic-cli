import { PathUtils } from 'fumadocs-core/source';
import type { ContentStorage, PageTreeTransformer } from 'fumadocs-core/source';
import type { Folder, Node } from 'fumadocs-core/page-tree';
import { apiBaseDir, containsUrl, docsRoute } from './shared';

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

/** The folders the CLI generates, by the token that positions each; the CLI's `GENERATED_SECTIONS` lists the same. */
export const GENERATED_SECTIONS = [
  { token: 'apimatic:sdks', folder: 'sdks' },
  { token: 'apimatic:plugin', folder: 'context-plugin' }
] as const;

const NAVIGATION_FILE_STEM = 'nav';

const API_REFERENCE_TITLE = 'API Reference';

/** Where the home page is served, which is how its node is told apart from every other page. */
const HOME_URL = docsRoute;

/** The Home tab's name when the root `nav.json` gives none, and the fallback home page's. */
const HOME_NAME = 'Home';

/** The node the fallback home page gets when there is no index page; see `withFallbackHomePage`. */
const SYNTHETIC_HOME_ID = '/page/home';

/** The Home tab's id. Fixed, as tab matching goes by id after serialisation; Fumadocs' ids never start with a slash. */
const HOME_TAB_ID = '/tab/home';

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

      // A directory with no order keeps Fumadocs' own, the root included.
      const settings = readSettings(this, folderPath);
      if (settings?.pages !== undefined) {
        node.children = reorder(this, node, folderPath, settings.pages);
      }
      if (folderPath === apiBaseDir) {
        applyApiStructure(this, node);
      }
      // Last, to outrank the index page's title and the API wrapper's; at the root it names Home instead.
      if (folderPath !== '' && settings?.title !== undefined) {
        node.name = settings.title;
      }
      return node;
    }
  };
}

/** A tab per entry of the root `nav.json`'s `tabs`, in its order; everything else is Home. */
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
  /** Read at the root only; the CLI refuses it anywhere else. */
  tabs: string[] | undefined;
}

function readSettings(context: NavigationContext, folderPath: string): NavigationSettings | undefined {
  // Resolved through the builder's own index so the extension is never hard-coded.
  const path = context.builder.resolveFlattenPath(PathUtils.joinPath(folderPath, NAVIGATION_FILE_STEM), 'meta');
  const file = context.storage.read(path);
  // Under `portal serve` a half-typed file reloads to here whatever the CLI says of it, and `null` would throw.
  if (file === undefined || file.format !== 'meta' || typeof file.data !== 'object' || file.data === null) {
    return undefined;
  }

  const { pages, tabs, title } = file.data as { pages?: unknown; tabs?: unknown; title?: unknown };
  // A half-typed title reloads to here as an empty string, which would blank the folder in
  // the sidebar with nothing to click. The CLI refuses one; the preview keeps the default
  // name until the file is worth reading again.
  const named = typeof title === 'string' ? title.trim() : '';
  return {
    pages: stringsOf(pages),
    tabs: stringsOf(tabs),
    title: named.length > 0 ? named : undefined
  };
}

function stringsOf(entries: unknown): string[] | undefined {
  return Array.isArray(entries) ? entries.filter((entry): entry is string => typeof entry === 'string') : undefined;
}

/** The nodes the root `tabs` names become the tabs, in its order; everything else is Home. */
function groupIntoTabs(context: NavigationContext, children: Node[]): Node[] {
  const settings = readSettings(context, '');
  const remaining = new Set(children);
  const tabs: Folder[] = [];

  // Resolved as `reorder` resolves an entry, before the tabs lose their `$ref`. A page is no
  // tab, and the home page is the Home tab's whichever `(group)` folder serves it; the CLI
  // refuses both entries, and an entry naming nothing is left to it as well.
  for (const raw of settings?.tabs ?? []) {
    const node = nodeNamed(context, [...remaining], '', raw.trim());
    if (node?.type === 'folder' && !containsUrl([node], HOME_URL)) {
      remaining.delete(node);
      tabs.push(asTab(node));
    }
  }

  // Fumadocs points a tab at the page with the same path inside the tab being left, when
  // there is one, and finds it through the folders' `$ref`. Between tabs that is the wrong
  // page -- `/api/overview` from `/tutorials/overview` -- so a tab always opens where its
  // own list starts. Nothing past this transformer reads a folder's `$ref`.
  for (const tab of tabs) {
    delete tab.$ref;
  }

  const home: Folder = {
    type: 'folder',
    $id: HOME_TAB_ID,
    name: settings?.title ?? HOME_NAME,
    root: true,
    children: withFallbackHomePage([...remaining])
  };
  // Home opens the site, so it leads wherever the file lists its pages; `index` orders them only.
  return [home, ...tabs];
}

/** Without an index page the route still renders a home page, which needs a node to be in a tab. */
function withFallbackHomePage(loose: Node[]): Node[] {
  if (containsUrl(loose, HOME_URL)) {
    return loose;
  }
  return [{ type: 'page', $id: SYNTHETIC_HOME_ID, name: HOME_NAME, url: HOME_URL }, ...loose];
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

/**
 * `node`'s children with the ones `order` names first, in its order, and the rest where its
 * rest token stands, or after everything named when it has none. The rest keep Fumadocs' own
 * order: pages before folders, each by path.
 */
function reorder(context: NavigationContext, node: Folder, folderPath: string, order: string[]): Node[] {
  const remaining = new Set(node.children);
  const named: Node[] = [];
  let restIndex: number | undefined;

  for (const raw of order) {
    const entry = raw.trim();
    if (entry === REST_TOKEN) {
      restIndex = named.length;
      continue;
    }
    const child = nodeNamed(context, [...remaining], folderPath, entry);
    if (child !== undefined) {
      remaining.delete(child);
      named.push(child);
    }
  }

  const at = restIndex ?? named.length;
  return [...named.slice(0, at), ...remaining, ...named.slice(at)];
}

/**
 * The child an entry names, or undefined. A token names a node that lives at the content root,
 * and the CLI refuses each one anywhere else; honouring it in a nested directory would let the
 * two halves of the format disagree about a file only one of them had rejected.
 */
function nodeNamed(context: NavigationContext, children: Node[], folderPath: string, entry: string): Node | undefined {
  const isContentRoot = folderPath === '';
  const section = GENERATED_SECTIONS.find((candidate) => candidate.token === entry);
  if (entry === API_REFERENCE_TOKEN) {
    return isContentRoot ? children.find((child) => isApiReference(child)) : undefined;
  }
  if (section !== undefined) {
    // The cheap path check first: `isInjected` reads storage.
    return isContentRoot
      ? children.find((child) => isSectionFolder(child, section) && isInjected(context, child))
      : undefined;
  }
  return matching(context, children, folderPath, entry);
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

