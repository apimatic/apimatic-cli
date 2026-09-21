import { PathUtils } from 'fumadocs-core/source';
import type { ContentStorage, PageTreeTransformer } from 'fumadocs-core/source';
import type { Folder, Node } from 'fumadocs-core/page-tree';
import { apiBaseDir } from './shared';

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
/** The pages the CLI generates and injects at the content root. */
const INJECTED_PAGES_TOKEN = 'apimatic:pages';
/** The API reference, positioned as one node. */
const API_REFERENCE_TOKEN = 'apimatic:api';

const NAVIGATION_FILE_STEM = 'nav';

const API_REFERENCE_TITLE = 'API Reference';

/**
 * The key the generated pages are passed to `loader()` under, which the storage stamps onto
 * every file of that source. No such source exists yet, so `apimatic:pages` resolves to
 * nothing; adding one is all it takes for the token to start positioning its pages.
 */
const GENERATED_SOURCE = 'generated';

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
      // `generateFallback` builds a second tree out of the files that never became nodes. A
      // metadata file is never one, so `nav.json` is always left over and this hook is
      // always called again, for a root with no children. Ordering nothing is harmless, but
      // skipping it keeps the intent clear.
      if (this.custom?._fallback === true) {
        return node;
      }

      // Ordered even with no file of its own: naming nothing still puts the injected pages
      // and the API reference at their defaults, and Fumadocs' own order would not. It
      // sorts folders by path, so `api` lands above a user folder called anything later in
      // the alphabet, and a generated page lands in the middle of the user's pages.
      node.children = reorder(this, node, folderPath, readOrder(this, folderPath) ?? []);
      if (folderPath === apiBaseDir) {
        applyApiStructure(node);
      }
      return node;
    }
  };
}

function readOrder(context: NavigationContext, folderPath: string): string[] | undefined {
  // Resolved through the builder's own index so the extension is never hard-coded.
  const path = context.builder.resolveFlattenPath(PathUtils.joinPath(folderPath, NAVIGATION_FILE_STEM), 'meta');
  const file = context.storage.read(path);
  // `data` is whatever was in the file. The CLI refuses a `nav.json` that is not an object,
  // but only once at startup: during `portal serve` a half-typed file reloads straight to
  // here, and `null` would throw out of the page-tree build.
  if (file === undefined || file.format !== 'meta' || typeof file.data !== 'object' || file.data === null) {
    return undefined;
  }

  const pages = (file.data as { pages?: unknown }).pages;
  return Array.isArray(pages) ? pages.filter((entry): entry is string => typeof entry === 'string') : undefined;
}

/**
 * Titles the wrapper and, for a single specification, lifts its section away.
 *
 * Fumadocs names an untitled folder by uppercasing its first character only, so `api` would
 * render as "Api", which reads as a typo. The section below it is named after the
 * specification's file, which with one document only restates the portal's own title; with
 * two or more the names tell them apart and are worth a level. Adding a second document
 * therefore inserts a level rather than renaming anything.
 */
function applyApiStructure(node: Folder): void {
  node.name = API_REFERENCE_TITLE;

  const [only] = node.children;
  if (node.children.length === 1 && only.type === 'folder') {
    node.children = only.children;
  }
}

function reorder(context: NavigationContext, node: Folder, folderPath: string, order: string[]): Node[] {
  const remaining = new Set(node.children);
  const named: Node[] = [];
  let restIndex: number | undefined;

  const claim = (child: Node | undefined): void => {
    if (child !== undefined) {
      remaining.delete(child);
      named.push(child);
    }
  };

  // Both tokens name nodes that live at the content root, and the CLI refuses either one
  // anywhere else. Honouring them in a nested directory would let the two halves of the
  // format disagree about a file only one of them had rejected.
  const isContentRoot = folderPath === '';

  for (const raw of order) {
    const entry = raw.trim();
    if (entry === REST_TOKEN) {
      restIndex = named.length;
    } else if (entry === API_REFERENCE_TOKEN) {
      if (isContentRoot) {
        claim(find(remaining, (child) => isApiReference(child)));
      }
    } else if (entry === INJECTED_PAGES_TOKEN) {
      if (isContentRoot) {
        for (const page of [...remaining].filter((child) => isInjected(context, child))) {
          claim(page);
        }
      }
    } else {
      claim(matching(context, remaining, folderPath, entry));
    }
  }

  // What is left keeps its default order, in three bands. The injected pages and the API
  // reference have defaults of their own rather than travelling with the content, so that
  // a later release adding a generated page never splits the band or reorders a sidebar
  // nobody touched.
  const rest = [...remaining];
  const api = rest.filter((child) => isApiReference(child));
  const injected = rest.filter((child) => isInjected(context, child));
  const content = rest.filter((child) => !isApiReference(child) && !isInjected(context, child));

  // With no rest token, unnamed content joins the user's own pages: after the last one the
  // file named. Appending at the end instead would drop it below the whole API reference,
  // and inserting before the reference would lift it above one the file deliberately put
  // first.
  const at = restIndex ?? afterNamedContent(context, named);
  const ordered = [...named.slice(0, at), ...content, ...named.slice(at)];

  const anchor = anchorIn(ordered);
  return [...ordered.slice(0, anchor), ...injected, ...ordered.slice(anchor), ...api];
}

/**
 * The child an entry addresses. A page is compared against the virtual path the builder
 * resolves its name to, a folder against its own path, which is why `noRef` has to stay at
 * its default of false.
 */
function matching(
  context: NavigationContext,
  children: Iterable<Node>,
  folderPath: string,
  entry: string
): Node | undefined {
  const target = PathUtils.joinPath(folderPath, entry);
  const pagePath = context.builder.resolveFlattenPath(target, 'page');
  return find(
    children,
    (child) =>
      (child.type === 'page' && child.$ref === pagePath) || (child.type === 'folder' && child.$ref?.folder === target)
  );
}

function afterNamedContent(context: NavigationContext, named: Node[]): number {
  for (let index = named.length - 1; index >= 0; index -= 1) {
    if (!isApiReference(named[index]) && !isInjected(context, named[index])) {
      return index + 1;
    }
  }
  return named.length;
}

function anchorIn(children: Node[]): number {
  const index = children.findIndex((child) => isApiReference(child));
  return index === -1 ? children.length : index;
}

function isApiReference(child: Node): boolean {
  return child.type === 'folder' && child.$ref?.folder === apiBaseDir;
}

/** Whether a page came from the generated source rather than the user's content directory. */
function isInjected(context: NavigationContext, child: Node): boolean {
  if (child.type !== 'page' || child.$ref === undefined) {
    return false;
  }
  return context.storage.read(child.$ref)?.type === GENERATED_SOURCE;
}

function find(children: Iterable<Node>, predicate: (child: Node) => boolean): Node | undefined {
  for (const child of children) {
    if (predicate(child)) {
      return child;
    }
  }
  return undefined;
}
