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

/** Each generated section, and the API reference. */
const TOKENS = [...GENERATED_SECTIONS.map((section) => section.token), API_REFERENCE_TOKEN];

/** The directory the reference is mounted at, which `content/api/` shares, and so the name someone guesses for it. */
export const API_REFERENCE_NAME = 'api';

/** The page a folder below the content root links to, which is never one of its children. */
export const INDEX_NAME = 'index';

/** A `(group)` folder, which a page's address leaves out and a folder's name leaves unbracketed. */
export const GROUP_FOLDER = /^\((.+)\)$/;

export const NAVIGATION_FILE_NAME = 'nav.json';

// A misspelled field would otherwise be stripped by Fumadocs' own schema and leave the
// sidebar in its default order with nothing said, so every unknown field is reported. The
// file has so few settings that a misspelling is answered by listing them all rather than
// guessing at the one it meant.
const KNOWN_FIELDS = new Set(['pages', 'title']);

/**
 * The content root's third setting: the tabs after Home, in order. Below the root it is
 * refused with a sentence of its own rather than as unknown, since it is a setting, just not
 * one of that file's.
 */
const TABS_FIELD = 'tabs';
const ROOT_FIELDS = new Set([...KNOWN_FIELDS, TABS_FIELD]);

/** Where a `nav.json` sits, and what its entries are allowed to address. */
export interface NavigationContext {
  /** The file's path relative to `src/`, as messages name it. */
  label: string;
  /** Every `apimatic:` token resolves to a node that lives at the content root. */
  isContentRoot: boolean;
  /** `content/api/`, where the reference is mounted, which is always a tab. */
  isApiDirectory: boolean;
  /**
   * Whether this directory becomes a folder in the sidebar at all. A directory with no page
   * anywhere beneath it does not, and the template drops the node Fumadocs builds for its
   * `nav.json`, so a title here would name nothing.
   */
  becomesFolder: boolean;
  /** Pages and subfolders in the same directory; page names carry no extension. */
  childNames: string[];
  /** The subfolders among them: the subdirectories with a page in them or below them, which are folders in the sidebar. */
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
  /** At the content root, the tabs after Home in order; empty when the file gives none, and below the root. */
  tabs: string[];
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

    const pages = PortalNavigation.entries(document.value.pages, 'pages', context);
    // Below the root the setting is refused above, and its entries are nobody's to check.
    const tabs: Result<string[] | undefined, string> = context.isContentRoot
      ? PortalNavigation.entries(document.value.tabs, TABS_FIELD, context)
      : ok(undefined);
    if (pages.isErr() || tabs.isErr()) {
      return err([...settingErrors, ...(pages.isErr() ? [pages.error] : []), ...(tabs.isErr() ? [tabs.error] : [])]);
    }

    // Every bad entry is reported at once rather than stopping at the first, so one edit
    // fixes the file.
    const errors = [
      ...settingErrors,
      ...PortalNavigation.entryErrors(pages.value ?? [], tabs.value, context),
      ...PortalNavigation.betaOneErrors(pages.value, tabs.value, context)
    ];
    return errors.length > 0 ? err(errors) : ok({ title, pages: pages.value ?? [], tabs: tabs.value ?? [] });
  }

  /** A list setting's entries, trimmed, or undefined when the file has no such setting. */
  private static entries(
    value: unknown,
    field: string,
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

  private static entryErrors(pages: string[], tabs: string[] | undefined, context: NavigationContext): string[] {
    const errors: string[] = [];
    // Keyed by the node an entry positions rather than its text: `content/api` is where the
    // reference is mounted, so at the content root the name and the token reach one node --
    // a directory the user keeps there merges into it rather than making a second. Naming it
    // twice would have the template honour whichever came first without a word. One map for
    // both lists, since a node is either a tab or in Home's sidebar: `api` in one and
    // `apimatic:api` in the other is the same node named twice.
    const seen = new Map<string, { list: string; entry: string }>();
    const lists: [string, string[]][] =
      tabs === undefined
        ? [['pages', pages]]
        : [
            ['pages', pages],
            [TABS_FIELD, tabs]
          ];

    for (const [list, entries] of lists) {
      for (const entry of entries) {
        const node = context.isContentRoot && entry === API_REFERENCE_NAME ? API_REFERENCE_TOKEN : entry;
        const earlier = seen.get(node);
        // The rest entry stands for whatever neither list names, so it is no node named twice
        // across them; `tabs` refuses it on its own account below.
        if (earlier !== undefined && (earlier.list === list || entry !== REST_TOKEN)) {
          errors.push(PortalNavigation.namedTwice(earlier, { list, entry }, context));
          continue;
        }
        seen.set(node, { list, entry });

        const checked =
          list === TABS_FIELD
            ? PortalNavigation.checkTabEntry(entry, context)
            : PortalNavigation.checkEntry(entry, context);
        if (checked.isErr()) {
          errors.push(checked.error);
        }
      }
    }
    return errors;
  }

  private static namedTwice(
    earlier: { list: string; entry: string },
    later: { list: string; entry: string },
    context: NavigationContext
  ): string {
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

  /**
   * The rules of a `tabs` entry, which is read at the content root only: a folder directly
   * under the content directory, the API reference or a generated section, each a tab after Home.
   */
  private static checkTabEntry(entry: string, context: NavigationContext): Result<void, string> {
    // A tab for every unlisted folder is the "every top-level folder a tab" design this file
    // exists to avoid: a project that groups its guides into folders would grow a row of tabs.
    if (entry === REST_TOKEN) {
      return err(
        `${context.label}: '${REST_TOKEN}' cannot be a tab, since it would make a tab of every folder ` +
          `'${TABS_FIELD}' does not name. Name the folders meant as tabs; the rest stay in Home.`
      );
    }

    if (entry.startsWith(APIMATIC_PREFIX)) {
      return PortalNavigation.checkToken(entry, context);
    }

    if (entry.length === 0) {
      return err(`${context.label}: '${TABS_FIELD}' must not contain an empty entry.`);
    }

    if (entry.includes('/') || entry.includes('\\')) {
      return err(
        `${context.label}: '${entry}' addresses another directory. A tab is a folder directly under the ` +
          `content directory.`
      );
    }

    // The reference is mounted at `content/api`, so the name and the token reach one node, as in `pages`.
    if (entry === API_REFERENCE_NAME) {
      return ok(undefined);
    }

    // The home page belongs to the Home tab, which opens on it.
    if (context.homePageFolders.includes(entry)) {
      return err(
        `${context.label}: '${entry}' serves the home page, which belongs to the Home tab, so it cannot ` +
          `be a tab of its own. Remove the entry, or move the page out of the folder.`
      );
    }

    // When a page and a folder share the name, the folder is the tab, as the template matches
    // a folder first; the page stays in Home.
    if (context.folderNames.includes(entry)) {
      return ok(undefined);
    }

    if (context.childNames.includes(entry)) {
      return err(
        `${context.label}: '${entry}' is a page, and a tab is a folder. Order it in Home's sidebar with ` +
          `'pages' instead.`
      );
    }

    if (context.emptyFolders.includes(entry)) {
      return err(
        `${context.label}: '${entry}' is a folder with no page in it or below it, so it is not in the ` +
          `sidebar. Add a page to it, or remove the entry.`
      );
    }

    return err(
      `${context.label}: '${entry}' is not a folder in this directory.${PortalNavigation.suggestion(entry, context)}`
    );
  }

  /**
   * 2.0.0-beta.1 had no `tabs`: the root file's `pages` made a tab of each folder and token it
   * named. Read under today's rule, such a file would put them all in Home's sidebar, the
   * quietly wrong sidebar this validation exists to refuse, and a warning would let an
   * unattended `portal generate` do it. A folder serving the home page does not count: beta.1
   * refused an entry naming one, so no beta.1 file holds it. Only beta users wrote that form,
   * so this check goes when 2.0.0 ships.
   */
  private static betaOneErrors(
    pages: string[] | undefined,
    tabs: string[] | undefined,
    context: NavigationContext
  ): string[] {
    if (!context.isContentRoot || tabs !== undefined || pages === undefined) {
      return [];
    }
    const wereTabs = pages.filter(
      (entry) =>
        entry === API_REFERENCE_NAME ||
        TOKENS.includes(entry) ||
        (context.folderNames.includes(entry) && !context.homePageFolders.includes(entry))
    );
    if (wereTabs.length === 0) {
      return [];
    }
    return [
      `${context.label} has no '${TABS_FIELD}', so it lists ${quotedList(wereTabs)} for Home's sidebar, where ` +
        `2.0.0-beta.1 made them tabs. Move the ones meant as tabs to '${TABS_FIELD}', or add "${TABS_FIELD}": [] ` +
        `to keep them in Home.`
    ];
  }

  /** The tabs are decided at the top of the content directory, and nothing reads the setting anywhere else. */
  private static tabsPlacementErrors(document: Record<string, unknown>, context: NavigationContext): string[] {
    if (context.isContentRoot || !Object.hasOwn(document, TABS_FIELD)) {
      return [];
    }
    return [
      `${context.label}: '${TABS_FIELD}' is only read in the ${NAVIGATION_FILE_NAME} at the top of the content ` +
        `directory, where the tabs are decided. Remove it here; this file orders its own folder with 'pages'.`
    ];
  }

  private static checkEntry(entry: string, context: NavigationContext): Result<void, string> {
    if (entry === REST_TOKEN) {
      return ok(undefined);
    }

    if (entry.startsWith(APIMATIC_PREFIX)) {
      return PortalNavigation.checkToken(entry, context);
    }

    if (entry.length === 0) {
      return err(`${context.label}: 'pages' must not contain an empty entry.`);
    }

    // Naming a nested path would claim the node out of its folder and leave the folder
    // behind as an empty one, so only direct children are addressable.
    if (entry.includes('/') || entry.includes('\\')) {
      return err(
        `${context.label}: '${entry}' addresses another directory. An entry names a page or ` +
          `folder in this directory; order a subfolder's pages with its own ${NAVIGATION_FILE_NAME}.`
      );
    }

    // A page of the same name is what the entry names, since the template drops the empty folder.
    if (!context.childNames.includes(entry) && context.emptyFolders.includes(entry)) {
      return err(
        `${context.label}: '${entry}' is a folder with no page in it or below it, so it is not in the ` +
          `sidebar. Add a page to it, or remove the entry.`
      );
    }

    if (!context.childNames.includes(entry)) {
      return err(
        `${context.label}: '${entry}' is not a page or folder in this directory.${PortalNavigation.suggestion(
          entry,
          context
        )}`
      );
    }

    // A page and a folder of one name are both children, and an entry positions the folder,
    // as it does in Fumadocs' own metadata. The page could then never be positioned, which
    // is the quietly wrong sidebar this file exists to refuse.
    if (PortalNavigation.isSharedName(entry, context)) {
      // At the content root the folder of that name is the API reference, mounted there
      // whether or not a directory exists to see. "Both a page and a folder" would send the
      // user looking for one.
      return err(
        context.isContentRoot && entry === API_REFERENCE_NAME
          ? `${context.label}: '${entry}' is where the API reference is mounted, so the entry positions ` +
              `the reference rather than the page of that name. Rename the page to position it.`
          : `${context.label}: '${entry}' is both a page and a folder in this directory, and the entry ` +
              `positions the folder. Rename the page to position it.`
      );
    }

    // Below the content root the index page is the folder's own, not one of the pages it orders.
    if (entry === INDEX_NAME && !context.isContentRoot) {
      return err(
        `${context.label}: '${INDEX_NAME}' is the page this folder opens on, so it cannot be positioned ` +
          `among its pages. Remove the entry; the folder itself is positioned by the ${NAVIGATION_FILE_NAME} ` +
          `one level up.`
      );
    }

    return ok(undefined);
  }

  private static checkToken(entry: string, context: NavigationContext): Result<void, string> {
    if (!TOKENS.includes(entry)) {
      return err(
        `${context.label}: '${entry}' is not a ${NAVIGATION_FILE_NAME} token. ` +
          `The tokens are ${quotedList(TOKENS)}.`
      );
    }

    // A nested file could not claim a node that lives at the root without the template moving
    // nodes between folders, which is what makes losing a page impossible today.
    if (!context.isContentRoot) {
      return err(
        `${context.label}: '${entry}' can only be used in the ${NAVIGATION_FILE_NAME} at the top ` +
          `of the content directory, because that is where the node it positions lives. List it in that ` +
          `file's '${TABS_FIELD}' to make it a tab, or in its 'pages' to place it in Home.`
      );
    }

    return ok(undefined);
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

  /**
   * A folder is named after its directory, or after the title of its index page; `title`
   * outranks both. At the content root it names the Home tab, which holds the pages there and
   * the folders the file does not list.
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
    // The settings every file has; `tabs`, the root's alone, is answered on its own above.
    const settings = quotedList([...KNOWN_FIELDS]);
    return `${context.label}: '${field}' is not a ${NAVIGATION_FILE_NAME} setting. The settings are ${settings}.`;
  }

  /** A near miss is nearly always a typo or a forgotten extension, so name the candidate. */
  private static suggestion(entry: string, context: NavigationContext): string {
    const lowered = entry.toLowerCase();
    const withoutExtension = lowered.replace(/\.mdx?$/i, '');
    // Matched without the extension too, so `api.md` is answered like `api` rather than
    // pointed at a name that is refused the moment they write it.
    if (withoutExtension === API_REFERENCE_NAME && context.isContentRoot) {
      return ` The API reference is positioned with '${API_REFERENCE_TOKEN}'.`;
    }
    const section = context.isContentRoot ? PortalNavigation.sectionGuessed(withoutExtension) : undefined;
    if (section !== undefined) {
      return ` '${section.token}' positions ${section.description}.`;
    }
    const candidate = context.childNames.find(
      (name) => name.toLowerCase() === lowered || name.toLowerCase() === withoutExtension
    );
    return candidate === undefined ? '' : ` Did you mean '${candidate}'?`;
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
