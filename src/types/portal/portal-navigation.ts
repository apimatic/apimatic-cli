import { err, ok, Result } from 'neverthrow';
import { isJsonObject } from '../../utils/json-utils.js';
import { unknownFieldErrors } from './unknown-fields.js';

const BYTE_ORDER_MARK = 0xfeff;

/** Everything in this directory that no other entry names. */
const REST_TOKEN = '...';
/** The pages the CLI generates for the project's SDKs, positioned as the SDKs tab. */
const INJECTED_PAGES_TOKEN = 'apimatic:sdks';
/** The API reference, positioned as one node. */
const API_REFERENCE_TOKEN = 'apimatic:api';

const APIMATIC_PREFIX = 'apimatic:';

/** The directory the reference is mounted at, which `content/api/` shares, and so the name someone guesses for it. */
export const API_REFERENCE_NAME = 'api';

/** The page a folder below the content root links to, which is never one of its children. */
export const INDEX_NAME = 'index';

export const NAVIGATION_FILE_NAME = 'nav.json';

// A misspelled field would otherwise be stripped by Fumadocs' own schema and leave the
// sidebar in its default order with nothing said, so every unknown field is reported. The
// file has so few settings that a misspelling is answered by listing them all rather than
// guessing at the one it meant.
const KNOWN_FIELDS = new Set(['pages', 'title', 'root']);

/** Where a `nav.json` sits, and what its entries are allowed to address. */
export interface NavigationContext {
  /** The file's path relative to `src/`, as messages name it. */
  label: string;
  /** Both `apimatic:` tokens resolve to nodes that live at the content root. */
  isContentRoot: boolean;
  /** Directly under the content root: the only place a folder can be a tab of its own. */
  isTopLevel: boolean;
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
}

/**
 * The rules of a `nav.json`, applied to one file. The template re-reads the file itself and
 * orders the page tree from it, so nothing here travels into the build: this exists to
 * refuse a file that would otherwise produce a quietly wrong sidebar. Fumadocs drops an
 * entry it cannot resolve without a word, which is why the CLI validates instead.
 */
export class PortalNavigation {
  public static validate(json: string, context: NavigationContext): Result<void, string[]> {
    const document = PortalNavigation.parseObject(json, context);
    if (document.isErr()) {
      return err(document.error);
    }

    const unknownFields = unknownFieldErrors(document.value, KNOWN_FIELDS, (field) =>
      PortalNavigation.describeUnknownField(field, context)
    );

    const settingErrors = [
      ...unknownFields,
      ...PortalNavigation.titleErrors(document.value.title, context),
      ...PortalNavigation.rootErrors(document.value.root, context)
    ];
    const isTab = context.isApiDirectory || PortalNavigation.isTab(document.value.root, context);

    const pages = document.value.pages;
    if (pages === undefined) {
      // A file with no `pages` orders nothing, which is odd but not wrong. It may still name
      // the folder, which is why the title is checked above rather than alongside the entries.
      return settingErrors.length > 0 ? err(settingErrors) : ok(undefined);
    }
    if (!Array.isArray(pages) || pages.some((entry) => typeof entry !== 'string')) {
      return err([...settingErrors, `${context.label}: 'pages' must be an array of strings.`]);
    }

    // Every bad entry is reported at once rather than stopping at the first, so one edit
    // fixes the file.
    const errors = [...settingErrors];
    // Keyed by the node an entry positions rather than its text: `content/api` is where the
    // reference is mounted, so at the content root the name and the token reach one node --
    // a directory the user keeps there merges into it rather than making a second. Naming it
    // twice would have the template honour whichever came first without a word.
    const seen = new Map<string, string>();

    for (const raw of pages as string[]) {
      const entry = raw.trim();
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

      const checked = PortalNavigation.checkEntry(entry, context, isTab);
      if (checked.isErr()) {
        errors.push(checked.error);
      }
    }

    return errors.length > 0 ? err(errors) : ok(undefined);
  }

  private static checkEntry(entry: string, context: NavigationContext, isTab: boolean): Result<void, string> {
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

    // Only below the content root: there, the index page is what the folder itself links to
    // rather than one of its children, so no position among them would be honoured. A tab
    // lists it first instead, for the same reason. The content root is a root folder, which
    // gets no such page and lists `index` as an ordinary child.
    if (entry === INDEX_NAME && !context.isContentRoot) {
      return err(
        isTab
          ? `${context.label}: '${INDEX_NAME}' is the page this tab opens on, which is always listed first, ` +
              `so it cannot be positioned here. Remove the entry.`
          : `${context.label}: '${INDEX_NAME}' is the page this folder links to rather than one of ` +
              `its pages, so it cannot be positioned here. Remove the entry; the folder itself is ` +
              `positioned by the ${NAVIGATION_FILE_NAME} one level up.`
      );
    }

    return ok(undefined);
  }

  private static checkToken(entry: string, context: NavigationContext): Result<void, string> {
    if (entry !== INJECTED_PAGES_TOKEN && entry !== API_REFERENCE_TOKEN) {
      return err(
        `${context.label}: '${entry}' is not a ${NAVIGATION_FILE_NAME} token. ` +
          `The tokens are '${INJECTED_PAGES_TOKEN}' and '${API_REFERENCE_TOKEN}'.`
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
   * outranks both. The content root is no folder in the sidebar, so a name given there would
   * set nothing, and the portal's own name is `apimatic.json`'s `portal.site.name`.
   */
  private static titleErrors(title: unknown, context: NavigationContext): string[] {
    if (title === undefined) {
      return [];
    }
    if (context.isContentRoot) {
      return [
        `${context.label}: 'title' names a folder, and this file orders the content root, ` +
          `which is not one. Set the portal's own name with 'portal.site.name' in apimatic.json.`
      ];
    }
    // A directory with no page beneath it becomes no folder, so the name would reach nothing
    // -- the same silent setting the content root is refused for. The parent's file is
    // already refused for naming such a directory, for the same reason.
    if (!context.becomesFolder) {
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

  /**
   * `root` makes a folder directly under the content root a tab of its own; anywhere else it
   * would set nothing, or nest one tab bar inside another. The template ignores it wherever
   * it is refused here, so the preview never shows a tab the build would reject.
   */
  private static rootErrors(root: unknown, context: NavigationContext): string[] {
    if (root === undefined) {
      return [];
    }
    if (root === false && !PortalNavigation.mayBeTab(context)) {
      return [`${context.label}: 'root' is false, which sets nothing here. Remove the setting.`];
    }
    const setting = `${context.label}: 'root' makes a folder a tab of its own`;
    if (context.isContentRoot) {
      return [
        `${setting}, and this file orders the content root, which holds every tab. Set it in the ` +
          `${NAVIGATION_FILE_NAME} of a folder directly under 'content'.`
      ];
    }
    if (context.isApiDirectory) {
      return [`${setting}, and the API reference is always one. Remove the setting.`];
    }
    if (!context.isTopLevel) {
      return [
        `${setting}, and only a folder directly under 'content' can be one. Set it in the ` +
          `${NAVIGATION_FILE_NAME} of the top-level folder this one sits in, or remove it.`
      ];
    }
    if (!context.becomesFolder) {
      return [
        `${setting}, but a directory with no page in it or below it is no folder in the sidebar. ` +
          `Add a page, or remove the setting.`
      ];
    }
    if (typeof root !== 'boolean') {
      return [`${context.label}: 'root' must be true or false.`];
    }
    return [];
  }

  private static isTab(root: unknown, context: NavigationContext): boolean {
    return root === true && PortalNavigation.mayBeTab(context);
  }

  private static mayBeTab(context: NavigationContext): boolean {
    return context.isTopLevel && !context.isApiDirectory && context.becomesFolder;
  }

  private static describeUnknownField(field: string, context: NavigationContext): string {
    // Listed from the same set the check uses, so a setting added later is named here too.
    const settings = [...KNOWN_FIELDS].map((name) => `'${name}'`);
    const listed = `${settings.slice(0, -1).join(', ')} and ${settings[settings.length - 1]}`;
    return `${context.label}: '${field}' is not a ${NAVIGATION_FILE_NAME} setting. The settings are ${listed}.`;
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
    const candidate = context.childNames.find(
      (name) => name.toLowerCase() === lowered || name.toLowerCase() === withoutExtension
    );
    return candidate === undefined ? '' : ` Did you mean '${candidate}'?`;
  }
}
