import { err, ok, Result } from 'neverthrow';
import { unknownFieldErrors } from './unknown-fields.js';

const BYTE_ORDER_MARK = 0xfeff;

/** Everything in this directory that no other entry names. */
const REST_TOKEN = '...';
/** The pages the CLI generates and injects at the content root. */
const INJECTED_PAGES_TOKEN = 'apimatic:pages';
/** The API reference, positioned as one node. */
const API_REFERENCE_TOKEN = 'apimatic:api';

const APIMATIC_PREFIX = 'apimatic:';

/** The directory the reference is mounted at, and so the name someone guesses for it. */
const API_REFERENCE_NAME = 'api';

/** The page a folder below the content root links to, which is never one of its children. */
const INDEX_NAME = 'index';

export const NAVIGATION_FILE_NAME = 'nav.json';
/**
 * Files that look like navigation but that the build never reads: Fumadocs' own `meta` file
 * in each format it accepts, which `nav.json` replaced, and `nav` in a format or a case the
 * build's glob does not match. Warned about wherever they are found, compared without
 * regard to case.
 */
export const IGNORED_NAVIGATION_FILE_NAMES = ['nav.json', 'nav.yaml', 'nav.yml', 'meta.json', 'meta.yaml', 'meta.yml'];

const KNOWN_FIELDS = new Set(['pages']);

// Plausible names for the one field there is. A misspelled field would otherwise be stripped
// by Fumadocs' own schema and leave the sidebar in its default order with nothing said.
const RENAMED_FIELDS = new Map<string, string>([
  ['order', 'pages'],
  ['items', 'pages'],
  ['page', 'pages'],
  ['navigation', 'pages'],
  ['toc', 'pages']
]);

// Fumadocs' own folder-metadata keys. Someone renaming a `meta.json` as the CLI's warning
// asks them to will carry these across, and "did you mean 'pages'?" would be a poor answer:
// they are not misspellings, they are a thing `nav.json` deliberately does not do.
const FUMADOCS_ONLY_FIELDS = new Set([
  'title',
  'icon',
  'description',
  'defaultOpen',
  'collapsible',
  'root',
  'pagesIndex'
]);

// The entry shapes Fumadocs' own `meta.json` accepts and `nav.json` does not: a separator, a
// link, an exclusion, an extract of another folder's pages, and the reversed rest.
const FUMADOCS_ENTRY_SYNTAX = [/^---.*---$/, /^\[.*\]\(.*\)$/, /^!/, /^\.\.\..+/, /^z\.\.\.a$/];

/** Where a `nav.json` sits, and what its entries are allowed to address. */
export interface NavigationContext {
  /** The file's path relative to `src/`, as messages name it. */
  label: string;
  /** Both `apimatic:` tokens resolve to nodes that live at the content root. */
  isContentRoot: boolean;
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

    const unknownFields = unknownFieldErrors(document.value, KNOWN_FIELDS, RENAMED_FIELDS, (field, intended) =>
      PortalNavigation.describeUnknownField(field, intended, context)
    );

    const pages = document.value.pages;
    if (pages === undefined) {
      // A file with no `pages` orders nothing, which is odd but not wrong.
      return unknownFields.length > 0 ? err(unknownFields) : ok(undefined);
    }
    if (!Array.isArray(pages) || pages.some((entry) => typeof entry !== 'string')) {
      return err([...unknownFields, `${context.label}: 'pages' must be an array of strings.`]);
    }

    // Every bad entry is reported at once rather than stopping at the first, so one edit
    // fixes the file.
    const errors = [...unknownFields];
    const seen = new Set<string>();

    for (const raw of pages as string[]) {
      const entry = raw.trim();
      if (seen.has(entry)) {
        errors.push(`${context.label}: '${entry}' is listed more than once.`);
        continue;
      }
      seen.add(entry);

      const checked = PortalNavigation.checkEntry(entry, context);
      if (checked.isErr()) {
        errors.push(checked.error);
      }
    }

    return errors.length > 0 ? err(errors) : ok(undefined);
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

    // Someone renaming a `meta.json` as the CLI's warning asks them to carries its entries
    // across; "not a page or folder" would be true of each and explain none of them.
    if (FUMADOCS_ENTRY_SYNTAX.some((syntax) => syntax.test(entry))) {
      return err(
        `${context.label}: '${entry}' is Fumadocs meta.json syntax, which ${NAVIGATION_FILE_NAME} does not ` +
          `read. An entry names a page or folder in this directory, '${REST_TOKEN}' stands for the ` +
          `rest, and '${INJECTED_PAGES_TOKEN}' and '${API_REFERENCE_TOKEN}' position what the CLI adds.`
      );
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

    // Only below the content root: there, the index page is what the folder itself links to
    // rather than one of its children, so no position among them would be honoured. The
    // content root is a root folder, which gets no such page and lists `index` as an ordinary
    // child.
    if (entry === INDEX_NAME && !context.isContentRoot) {
      return err(
        `${context.label}: '${INDEX_NAME}' is the page this folder links to rather than one of ` +
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
    // Unlike `portal.json`, this file is not read by the CLI alone: the build reads it again
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
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return err([`${context.label} must contain a JSON object.`]);
    }
    return ok(data as Record<string, unknown>);
  }

  private static describeUnknownField(field: string, intended: string | undefined, context: NavigationContext): string {
    if (intended !== undefined) {
      return `${context.label}: '${field}' is not a ${NAVIGATION_FILE_NAME} setting; did you mean '${intended}'?`;
    }
    if (FUMADOCS_ONLY_FIELDS.has(field)) {
      return (
        `${context.label}: '${field}' is not a ${NAVIGATION_FILE_NAME} setting. ` +
        `${NAVIGATION_FILE_NAME} sets the order of pages and nothing else; a folder is named ` +
        `after its directory, or after the title of its index page.`
      );
    }
    return `${context.label}: '${field}' is not a ${NAVIGATION_FILE_NAME} setting.`;
  }

  /** A near miss is nearly always a typo or a forgotten extension, so name the candidate. */
  private static suggestion(entry: string, context: NavigationContext): string {
    const lowered = entry.toLowerCase();
    // The reference is mounted at `/api`, so `api` is the natural guess at its name.
    if (lowered === API_REFERENCE_NAME && context.isContentRoot) {
      return ` The API reference is positioned with '${API_REFERENCE_TOKEN}'.`;
    }
    const candidate = context.childNames.find(
      (name) => name.toLowerCase() === lowered || name.toLowerCase() === lowered.replace(/\.mdx?$/i, '')
    );
    return candidate === undefined ? '' : ` Did you mean '${candidate}'?`;
  }
}
