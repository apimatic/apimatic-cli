import { err, ok, Result } from 'neverthrow';
import { isJsonObject } from '../../utils/json-utils.js';
import { quotedList } from './config/fields.js';
import { GENERATED_SECTIONS, GeneratedSection } from './generated-pages.js';
import { unknownFieldErrors } from './unknown-fields.js';

const BYTE_ORDER_MARK = 0xfeff;

/** Everything in this directory that no other entry names. */
const REST_TOKEN = '...';
/** The API reference, positioned as one node. */
export const API_REFERENCE_TOKEN = 'apimatic:api';

const APIMATIC_PREFIX = 'apimatic:';

/** Each generated section's token and the API reference's, in the order the scaffold lists them as tabs. */
export const TOKENS = [...GENERATED_SECTIONS.map((section) => section.token), API_REFERENCE_TOKEN];

/** The directory the reference is mounted at, which `content/api/` shares, and so the name someone guesses for it. */
export const API_REFERENCE_NAME = 'api';

/** The page a folder below the content root links to, which is never one of its children. */
export const INDEX_NAME = 'index';

/** A `(group)` folder, which a page's address leaves out and a folder's name leaves unbracketed. */
export const GROUP_FOLDER = /^\((.+)\)$/;

export const NAVIGATION_FILE_NAME = 'nav.json';

/** Orders the folder's nodes; at the content root, Home's sidebar. */
const PAGES_FIELD = 'pages';
/** The root file's list of the tabs after Home, which are the only tabs. */
const TABS_FIELD = 'tabs';
type ListName = typeof PAGES_FIELD | typeof TABS_FIELD;

// A misspelled field would otherwise be stripped by Fumadocs' own schema and leave the
// sidebar in its default order with nothing said, so every unknown field is reported.
const KNOWN_FIELDS = new Set([PAGES_FIELD, 'title']);
/** The root file's settings; the template's schema keeps each of them, and a test holds the two together. */
export const ROOT_FIELDS = new Set([...KNOWN_FIELDS, TABS_FIELD]);

/** One entry of a list, with the list that holds it. */
interface ListedEntry {
  list: ListName;
  entry: string;
}

/**
 * What an entry names, resolved once for every rule. At the content root `api` and
 * `apimatic:api` are one node, since the reference is mounted at `content/api`, and a folder
 * outranks a page of its name, as it does in Fumadocs' own metadata.
 */
type EntryTarget =
  | { kind: 'rest' }
  /** An `apimatic:` string that positions nothing here: unknown, or a token below the root. */
  | { kind: 'token'; token: string }
  | { kind: 'apiReference' }
  | { kind: 'generated'; section: GeneratedSection }
  | { kind: 'folder'; name: string }
  | { kind: 'page'; name: string }
  | { kind: 'emptyFolder'; name: string }
  | { kind: 'nothing' };

/** What a misspelled entry was most likely meant as. */
type NearMiss = Extract<EntryTarget, { kind: 'apiReference' | 'generated' | 'folder' | 'page' }>;

/** A tab after Home, as the root file's `tabs` names it and in its order. */
export type TabEntry = Extract<EntryTarget, { kind: 'apiReference' | 'generated' | 'folder' }>;

/** Where a `nav.json` sits, and what its entries are allowed to address. */
export interface NavigationContext {
  /** The file's path relative to `src/`, as messages name it. */
  label: string;
  /** Every `apimatic:` token resolves to a node that lives at the content root. */
  isContentRoot: boolean;
  /** `content/api/`, where the reference is mounted. */
  isApiDirectory: boolean;
  /** Whether this directory is a folder in the sidebar: one with a page anywhere beneath it, or `content/api/`. */
  becomesFolder: boolean;
  /** Pages and subfolders in the same directory; page names carry no extension. */
  childNames: string[];
  /** The subfolders among them, which are folders in the sidebar. */
  folderNames: string[];
  /** Subdirectories with no page in them or below them, which are no folder in the sidebar. */
  emptyFolders: string[];
  /** Subfolders that serve the home page, as a `(group)` folder's index page can at the content root. */
  homePageFolders: string[];
}

/** What a valid `nav.json` says about its directory. */
export interface NavigationSettings {
  /** The name it gives its folder, or at the content root the Home tab. */
  title: string | undefined;
  /** Its entries, trimmed, which order the folder's pages; at the content root, Home's sidebar. */
  pages: string[];
  /**
   * At the content root, the tabs after Home in order, and the only ones. Undefined when the
   * file has no `tabs`, which makes no tab either, but is worth a word to a project that had
   * tabs before the setting existed; and below the root, where the setting is refused.
   */
  tabs: TabEntry[] | undefined;
}

/**
 * The rules of a `nav.json`, applied to one file. The template re-reads the file itself and
 * orders the page tree from it, so nothing here travels into the build: this exists to
 * refuse a file that would otherwise produce a quietly wrong sidebar. Fumadocs drops an
 * entry it cannot resolve without a word, which is why the CLI validates instead.
 */
export class PortalNavigation {
  public static validate(json: string, context: NavigationContext): Result<NavigationSettings, string[]> {
    const document = PortalNavigation.parseObject(json, context);
    if (document.isErr()) {
      return err(document.error);
    }

    const unknownFields = unknownFieldErrors(document.value, ROOT_FIELDS, (field) =>
      PortalNavigation.describeUnknownField(field, context)
    );
    // A file with no `pages` orders nothing, which is odd but not wrong. It may still name
    // the folder, which is why the title is checked here rather than alongside the entries.
    const settingErrors = [
      ...unknownFields,
      ...PortalNavigation.tabsPlacementErrors(document.value, context),
      ...PortalNavigation.titleErrors(document.value.title, context)
    ];
    const title = typeof document.value.title === 'string' ? document.value.title.trim() : undefined;

    const pages = PortalNavigation.entries(document.value.pages, PAGES_FIELD, context);
    // Below the root the setting is refused above, and its entries are nobody's to check.
    const tabs: Result<string[] | undefined, string> = context.isContentRoot
      ? PortalNavigation.entries(document.value.tabs, TABS_FIELD, context)
      : ok(undefined);

    // Every bad entry is reported at once rather than stopping at the first, so one edit
    // fixes the file: a list of the wrong type leaves the other list's entries to check.
    const listed = (list: ListName, entries: Result<string[] | undefined, string>): ListedEntry[] =>
      entries.isOk() ? (entries.value ?? []).map((entry) => ({ list, entry })) : [];
    const errors = [
      ...settingErrors,
      ...(pages.isErr() ? [pages.error] : []),
      ...(tabs.isErr() ? [tabs.error] : []),
      ...PortalNavigation.entryErrors([...listed(PAGES_FIELD, pages), ...listed(TABS_FIELD, tabs)], context)
    ];
    if (errors.length > 0) {
      return err(errors);
    }
    const tabEntries = tabs.unwrapOr(undefined);
    return ok({
      title,
      pages: pages.unwrapOr(undefined) ?? [],
      tabs: tabEntries === undefined ? undefined : PortalNavigation.tabEntries(tabEntries, context)
    });
  }

  /** A list setting's entries, trimmed, or undefined when the file has no such setting. */
  private static entries(
    value: unknown,
    field: ListName,
    context: NavigationContext
  ): Result<string[] | undefined, string> {
    if (value === undefined) {
      return ok(undefined);
    }
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      return err(`${context.label}: '${field}' must be an array of strings.`);
    }
    return ok((value as string[]).map((entry) => entry.trim()));
  }

  /** The tabs a valid file's `tabs` names, as the tab bar shows them. */
  private static tabEntries(entries: string[], context: NavigationContext): TabEntry[] {
    return entries.flatMap((entry) => {
      const target = PortalNavigation.target(entry, context);
      return target.kind === 'apiReference' || target.kind === 'generated' || target.kind === 'folder' ? [target] : [];
    });
  }

  private static entryErrors(entries: ListedEntry[], context: NavigationContext): string[] {
    const errors: string[] = [];
    // Keyed by the node an entry positions rather than its text, and one map for both lists:
    // a node is either a tab or in Home's sidebar, so `api` in one and `apimatic:api` in the
    // other is the same node named twice. Naming it twice would have the template honour
    // whichever came first without a word.
    const seen = new Map<string, ListedEntry>();

    for (const listed of entries) {
      const target = PortalNavigation.target(listed.entry, context);
      const node = target.kind === 'apiReference' ? API_REFERENCE_TOKEN : listed.entry;
      const earlier = seen.get(node);
      // The rest entry stands for whatever neither list names, so it is no node named twice
      // across them; `tabs` refuses it on its own account.
      if (earlier !== undefined && (earlier.list === listed.list || target.kind !== 'rest')) {
        errors.push(PortalNavigation.namedTwice(earlier, listed, context));
        continue;
      }
      seen.set(node, listed);

      const error =
        PortalNavigation.syntaxError(listed, context) ??
        (listed.list === TABS_FIELD
          ? PortalNavigation.tabEntryError(listed.entry, target, context)
          : PortalNavigation.pageEntryError(listed.entry, target, context));
      if (error !== undefined) {
        errors.push(error);
      }
    }
    return errors;
  }

  /** What an entry names in this directory, or as a token at the content root. */
  private static target(entry: string, context: NavigationContext): EntryTarget {
    if (entry === REST_TOKEN) {
      return { kind: 'rest' };
    }
    if (context.isContentRoot) {
      if (entry === API_REFERENCE_NAME || entry === API_REFERENCE_TOKEN) {
        return { kind: 'apiReference' };
      }
      const section = GENERATED_SECTIONS.find((candidate) => candidate.token === entry);
      if (section !== undefined) {
        return { kind: 'generated', section };
      }
    }
    if (entry.startsWith(APIMATIC_PREFIX)) {
      return { kind: 'token', token: entry };
    }
    // A mounted folder, such as a specification's section under `content/api/`, is no subfolder
    // but is listed twice beside a page of its name, and the folder is what the name positions.
    if (context.folderNames.includes(entry) || PortalNavigation.isSharedName(entry, context)) {
      return { kind: 'folder', name: entry };
    }
    if (context.childNames.includes(entry)) {
      return { kind: 'page', name: entry };
    }
    if (context.emptyFolders.includes(entry)) {
      return { kind: 'emptyFolder', name: entry };
    }
    return { kind: 'nothing' };
  }

  private static namedTwice(earlier: ListedEntry, later: ListedEntry, context: NavigationContext): string {
    if (earlier.list === later.list) {
      return earlier.entry === later.entry
        ? `${context.label}: '${later.entry}' is listed more than once.`
        : `${context.label}: '${earlier.entry}' and '${later.entry}' both position the API reference; keep one of them.`;
    }
    const named =
      earlier.entry === later.entry
        ? `'${later.entry}' is in both '${earlier.list}' and '${later.list}'`
        : `'${earlier.entry}' in '${earlier.list}' and '${later.entry}' in '${later.list}' both position the API reference`;
    return `${context.label}: ${named}, and a node is either a tab or in Home's sidebar. Keep one of them.`;
  }

  /** What is wrong with an entry before it names anything: empty, or a path into another directory. */
  private static syntaxError({ list, entry }: ListedEntry, context: NavigationContext): string | undefined {
    if (entry.length === 0) {
      return `${context.label}: '${list}' must not contain an empty entry.`;
    }
    // Naming a nested path would claim the node out of its folder and leave the folder
    // behind as an empty one, so only direct children are addressable.
    if (entry.includes('/') || entry.includes('\\')) {
      return list === TABS_FIELD
        ? `${context.label}: '${entry}' addresses another directory. A tab is a folder directly under the ` +
            `content directory.`
        : `${context.label}: '${entry}' addresses another directory. An entry names a page or ` +
            `folder in this directory; order a subfolder's pages with its own ${NAVIGATION_FILE_NAME}.`;
    }
    return undefined;
  }

  /** The rules of a `tabs` entry: a folder directly under the content directory, the API reference or a section. */
  private static tabEntryError(entry: string, target: EntryTarget, context: NavigationContext): string | undefined {
    switch (target.kind) {
      case 'rest':
        // A tab for every unlisted folder is the "every top-level folder a tab" design this
        // file exists to avoid: a project that groups its guides into folders would grow a row of tabs.
        return (
          `${context.label}: '${REST_TOKEN}' cannot be a tab, since it would make a tab of every folder ` +
          `'${TABS_FIELD}' does not name. Name the folders meant as tabs; the rest stay in Home.`
        );
      case 'token':
        return PortalNavigation.tokenError(target.token, context);
      case 'apiReference':
        return PortalNavigation.apiSharedNameError(context);
      case 'generated':
        return undefined;
      case 'folder':
        // The home page belongs to the Home tab, which opens on it.
        return context.homePageFolders.includes(target.name)
          ? `${context.label}: '${entry}' serves the home page, which belongs to the Home tab, so it cannot ` +
              `be a tab of its own. Remove the entry, or move the page out of the folder.`
          : undefined;
      case 'page':
        return `${context.label}: ${PortalNavigation.pageIsNoTab(target.name)}`;
      case 'emptyFolder':
        return PortalNavigation.emptyFolderError(entry, context);
      case 'nothing':
        return `${context.label}: '${entry}' is not a folder in this directory.${PortalNavigation.tabSuggestion(
          entry,
          context
        )}`;
    }
  }

  /** The rules of a `pages` entry: a page or folder in this directory, or at the content root a token. */
  private static pageEntryError(entry: string, target: EntryTarget, context: NavigationContext): string | undefined {
    switch (target.kind) {
      case 'rest':
      case 'generated':
        return undefined;
      case 'token':
        return PortalNavigation.tokenError(target.token, context);
      case 'apiReference':
        return PortalNavigation.apiSharedNameError(context);
      case 'folder':
        // A page and a folder of one name are both children, and an entry positions the folder.
        // The page could then never be positioned, which is the quietly wrong sidebar this file
        // exists to refuse.
        return PortalNavigation.isSharedName(target.name, context)
          ? `${context.label}: '${entry}' is both a page and a folder in this directory, and the entry ` +
              `positions the folder. Rename the page to position it.`
          : undefined;
      case 'page':
        // Below the content root the index page is the folder's own, not one of the pages it orders.
        return target.name === INDEX_NAME && !context.isContentRoot
          ? `${context.label}: '${INDEX_NAME}' is the page this folder opens on, so it cannot be positioned ` +
              `among its pages. Remove the entry; the folder itself is positioned by the ${NAVIGATION_FILE_NAME} ` +
              `one level up.`
          : undefined;
      case 'emptyFolder':
        return PortalNavigation.emptyFolderError(entry, context);
      case 'nothing':
        return `${context.label}: '${entry}' is not a page or folder in this directory.${PortalNavigation.suggestion(
          entry,
          context
        )}`;
    }
  }

  /** An `apimatic:` entry that positions nothing here: no token at all, or one below the root. */
  private static tokenError(token: string, context: NavigationContext): string {
    if (!TOKENS.includes(token)) {
      return `${context.label}: '${token}' is not a ${NAVIGATION_FILE_NAME} token. The tokens are ${quotedList(
        TOKENS
      )}.`;
    }
    // A nested file could not claim a node that lives at the root without the template moving
    // nodes between folders, which is what makes losing a page impossible today.
    return (
      `${context.label}: '${token}' can only be used in the ${NAVIGATION_FILE_NAME} at the top ` +
      `of the content directory, because that is where the node it positions lives. List it in that ` +
      `file's '${TABS_FIELD}' to make it a tab, or in its '${PAGES_FIELD}' to place it in Home.`
    );
  }

  /** The tabs are decided at the top of the content directory, and nothing reads the setting anywhere else. */
  private static tabsPlacementErrors(document: Record<string, unknown>, context: NavigationContext): string[] {
    if (context.isContentRoot || !Object.hasOwn(document, TABS_FIELD)) {
      return [];
    }
    return [
      `${context.label}: '${TABS_FIELD}' is only read in the ${NAVIGATION_FILE_NAME} at the top of the content ` +
        `directory, where the tabs are decided. Remove it here; this file orders its own folder with '${PAGES_FIELD}'.`
    ];
  }

  private static parseObject(json: string, context: NavigationContext): Result<Record<string, unknown>, string[]> {
    // Unlike `apimatic.json`, this file is not read by the CLI alone: the build reads it again
    // from the content directory with a bare `JSON.parse`, which a byte-order mark breaks.
    // Accepting the mark here would pass a file the build then refuses with an opaque error.
    if (json.codePointAt(0) === BYTE_ORDER_MARK) {
      return err([
        `${context.label} starts with a byte-order mark, which the build cannot read. ` +
          `Save the file as UTF-8 without a BOM.`
      ]);
    }

    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      return err([`${context.label} is not valid JSON.`]);
    }
    if (!isJsonObject(data)) {
      return err([`${context.label} must contain a JSON object.`]);
    }
    return ok(data);
  }

  /** Whether a page and a folder in this directory both answer to the name. */
  private static isSharedName(entry: string, context: NavigationContext): boolean {
    return context.childNames.filter((name) => name === entry).length > 1;
  }

  /** A page named `api` beside the mount point could never be positioned, whichever spelling the entry uses. */
  private static apiSharedNameError(context: NavigationContext): string | undefined {
    return PortalNavigation.isSharedName(API_REFERENCE_NAME, context)
      ? `${context.label}: '${API_REFERENCE_NAME}' is where the API reference is mounted, so the entry positions ` +
          `the reference rather than the page of that name. Rename the page to position it.`
      : undefined;
  }

  private static emptyFolderError(entry: string, context: NavigationContext): string {
    return (
      `${context.label}: '${entry}' is a folder with no page in it or below it, so it is not in the ` +
      `sidebar. Add a page to it, or remove the entry.`
    );
  }

  private static pageIsNoTab(name: string): string {
    return `'${name}' is a page, and a tab is a folder. Order it in Home's sidebar with '${PAGES_FIELD}' instead.`;
  }

  /**
   * A folder is named after its directory, or after the title of its index page; `title`
   * outranks both. At the content root it names the Home tab.
   */
  private static titleErrors(title: unknown, context: NavigationContext): string[] {
    if (title === undefined) {
      return [];
    }
    // At the root it names the Home tab, which exists without a page; a folder without one does not.
    if (!context.isContentRoot && !context.becomesFolder) {
      return [
        `${context.label}: 'title' names this folder, but a directory with no page in it or ` +
          `below it is no folder in the sidebar. Add a page, or remove the setting.`
      ];
    }
    if (typeof title !== 'string' || title.trim().length === 0) {
      return [`${context.label}: 'title' must be a non-empty string.`];
    }
    return [];
  }

  private static describeUnknownField(field: string, context: NavigationContext): string {
    const settings = quotedList([...(context.isContentRoot ? ROOT_FIELDS : KNOWN_FIELDS)]);
    return `${context.label}: '${field}' is not a ${NAVIGATION_FILE_NAME} setting. The settings are ${settings}.`;
  }

  /** A tab entry's near miss, in the words of what `tabs` accepts. */
  private static tabSuggestion(entry: string, context: NavigationContext): string {
    const miss = PortalNavigation.nearMiss(entry, context);
    switch (miss?.kind) {
      case 'apiReference':
        return ` The API reference is a tab as '${API_REFERENCE_NAME}' or '${API_REFERENCE_TOKEN}'.`;
      case 'generated':
        return ` '${miss.section.token}' makes ${miss.section.description} a tab.`;
      case 'folder':
        return ` Did you mean '${miss.name}'?`;
      case 'page':
        return ` ${PortalNavigation.pageIsNoTab(miss.name)}`;
      default:
        return '';
    }
  }

  /** A `pages` entry's near miss; a folder and a page are both children here, so one sentence names either. */
  private static suggestion(entry: string, context: NavigationContext): string {
    const miss = PortalNavigation.nearMiss(entry, context);
    switch (miss?.kind) {
      case 'apiReference':
        return ` The API reference is positioned with '${API_REFERENCE_TOKEN}'.`;
      case 'generated':
        return ` '${miss.section.token}' positions ${miss.section.description}.`;
      case 'folder':
      case 'page':
        return ` Did you mean '${miss.name}'?`;
      default:
        return '';
    }
  }

  /** A near miss is nearly always a typo or a forgotten extension, so find what it names. */
  private static nearMiss(entry: string, context: NavigationContext): NearMiss | undefined {
    const lowered = entry.toLowerCase();
    // Matched without the extension too, so `api.md` is answered like `api` rather than
    // pointed at a name that is refused the moment they write it.
    const stripped = lowered.replace(/\.mdx?$/i, '');
    if (context.isContentRoot) {
      if (stripped === API_REFERENCE_NAME) {
        return { kind: 'apiReference' };
      }
      const section = PortalNavigation.sectionGuessed(stripped);
      if (section !== undefined) {
        return { kind: 'generated', section };
      }
    }
    const matches = (name: string): boolean => name.toLowerCase() === lowered || name.toLowerCase() === stripped;
    const candidate = context.folderNames.find(matches) ?? context.childNames.find(matches);
    const target = candidate === undefined ? undefined : PortalNavigation.target(candidate, context);
    return target?.kind === 'folder' || target?.kind === 'page' ? target : undefined;
  }

  /**
   * The section an entry was most likely meant to position: one named after its address, or
   * after the word its token ends in, which for the context plugin is not the same word.
   */
  private static sectionGuessed(name: string): GeneratedSection | undefined {
    return GENERATED_SECTIONS.find(
      (section) => name === section.folder || name === section.token.slice(APIMATIC_PREFIX.length)
    );
  }
}
