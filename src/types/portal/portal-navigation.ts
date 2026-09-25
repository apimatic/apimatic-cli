import { err, ok, Result } from 'neverthrow';
import { isJsonObject } from '../../utils/json-utils.js';
import { listedInProse } from '../../utils/string-utils.js';
import { GENERATED_SECTIONS, GeneratedSection } from './generated-pages.js';
import { unknownFieldErrors } from './unknown-fields.js';

const BYTE_ORDER_MARK = 0xfeff;

/** Everything in this directory that no other entry names. */
const REST_TOKEN = '...';
/** The API reference, positioned as one node. */
const API_REFERENCE_TOKEN = 'apimatic:api';

const APIMATIC_PREFIX = 'apimatic:';

/** Each generated section's tab, and the API reference. */
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
  /** Subdirectories with no page in them or below them, which are no folder in the sidebar. */
  emptyFolders: string[];
  /** Subfolders that serve the home page, as a `(group)` folder's index page can at the content root. */
  homePageFolders: string[];
}

/** What a valid `nav.json` says about its directory. */
export interface NavigationSettings {
  /** The name it gives its folder, or at the content root the Home tab. */
  title: string | undefined;
  /** Its entries, trimmed; at the content root, each folder they name is a tab. */
  pages: string[];
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

    const unknownFields = unknownFieldErrors(document.value, KNOWN_FIELDS, (field) =>
      PortalNavigation.describeUnknownField(field, context)
    );

    const settingErrors = [...unknownFields, ...PortalNavigation.titleErrors(document.value.title, context)];
    const title = typeof document.value.title === 'string' ? document.value.title.trim() : undefined;

    const pages = document.value.pages;
    if (pages === undefined) {
      // A file with no `pages` orders nothing, which is odd but not wrong. It may still name
      // the folder, which is why the title is checked above rather than alongside the entries.
      return settingErrors.length > 0 ? err(settingErrors) : ok({ title, pages: [] });
    }
    if (!Array.isArray(pages) || pages.some((entry) => typeof entry !== 'string')) {
      return err([...settingErrors, `${context.label}: 'pages' must be an array of strings.`]);
    }
    const entries = (pages as string[]).map((entry) => entry.trim());

    // Every bad entry is reported at once rather than stopping at the first, so one edit
    // fixes the file.
    const errors = [...settingErrors];
    // Keyed by the node an entry positions rather than its text: `content/api` is where the
    // reference is mounted, so at the content root the name and the token reach one node --
    // a directory the user keeps there merges into it rather than making a second. Naming it
    // twice would have the template honour whichever came first without a word.
    const seen = new Map<string, string>();

    for (const entry of entries) {
      const node = context.isContentRoot && entry === API_REFERENCE_NAME ? API_REFERENCE_TOKEN : entry;
      const earlier = seen.get(node);
      if (earlier !== undefined) {
        errors.push(
          earlier === entry
            ? `${context.label}: '${entry}' is listed more than once.`
            : `${context.label}: '${earlier}' and '${entry}' both position the API reference; keep one of them.`
        );
        continue;
      }
      seen.set(node, entry);

      const checked = PortalNavigation.checkEntry(entry, context);
      if (checked.isErr()) {
        errors.push(checked.error);
      }
    }

    return errors.length > 0 ? err(errors) : ok({ title, pages: entries });
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

    // Each folder the content root lists is a tab, and the home page is the Home tab's.
    if (context.homePageFolders.includes(entry)) {
      return err(
        `${context.label}: '${entry}' serves the home page, which belongs to the Home tab, so it cannot ` +
          `be a tab of its own. Remove the entry, or move the page out of the folder.`
      );
    }

    return ok(undefined);
  }

  private static checkToken(entry: string, context: NavigationContext): Result<void, string> {
    if (!TOKENS.includes(entry)) {
      return err(
        `${context.label}: '${entry}' is not a ${NAVIGATION_FILE_NAME} token. ` +
          `The tokens are ${listedInProse(TOKENS.map((token) => `'${token}'`))}.`
      );
    }

    if (!context.isContentRoot) {
      return err(
        `${context.label}: '${entry}' can only be used in the ${NAVIGATION_FILE_NAME} at the top ` +
          `of the content directory, because that is where the node it positions lives.`
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
    // Listed from the same set the check uses, so a setting added later is named here too.
    const settings = listedInProse([...KNOWN_FIELDS].map((name) => `'${name}'`));
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
