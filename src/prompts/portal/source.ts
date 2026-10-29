import { log } from '@clack/prompts';
import { APIMATIC_CONFIG_FILE_NAME } from '../../types/apimatic-config/document.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { listedInProse } from '../../utils/string-utils.js';
import { ContentNotices, NoTabsListed } from '../../types/portal/content-notices.js';
import { API_REFERENCE_TOKEN, NAVIGATION_FILE_NAME, TabEntry } from '../../types/portal/portal-navigation.js';
import {
  ContentProblem,
  MissingFile,
  MissingImage,
  PortalSourceProblem,
  ReservedAddressPage,
  SharedAddress,
  SpecConversion,
  UnreadableSpecReason
} from '../../types/portal/portal-source.js';
import { Shared } from '../../types/portal/shared.js';
import { MERGE_SETTINGS } from '../../types/portal/spec-metadata.js';
import { TRANSFORMATIONS_DIRECTORY_NAME } from '../../types/transform-context.js';
import { PortalTab, SharedTabName } from '../../types/portal/portal-tabs.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';
import {
  CONTENT_DIRECTORY_NAME,
  METADATA_FILE_NAME,
  SPEC_DIRECTORY_NAME,
  SPEC_EXTENSIONS,
  STATIC_DIRECTORY_NAME
} from '../../types/project-layout.js';
import { format as f } from '../format.js';

const TITLE_EXAMPLE = ['---', 'title: Getting started', '---'].join('\n');

const ROOT_NAVIGATION_FILE = `${CONTENT_DIRECTORY_NAME}/${NAVIGATION_FILE_NAME}`;

const mergeTheFolders = (): string =>
  `set ${f.var(`${MERGE_SETTINGS.configuration}.${MERGE_SETTINGS.mergeApis}`)} to true in an ` +
  `${f.var(METADATA_FILE_NAME)} beside the folders`;

const addingToMergeOrder = (folders: string): string =>
  `adding ${folders} to ${f.var(MERGE_SETTINGS.order)} when the file lists folders`;

export const specDirectoryOf = (sourceDirectory: DirectoryPath): DirectoryPath =>
  sourceDirectory.join(SPEC_DIRECTORY_NAME);

export const specPath = (sourceDirectory: DirectoryPath): string => f.path(specDirectoryOf(sourceDirectory));

export const contentPath = (sourceDirectory: DirectoryPath): string =>
  f.path(sourceDirectory.join(CONTENT_DIRECTORY_NAME));

export const staticPath = (sourceDirectory: DirectoryPath): string =>
  f.path(sourceDirectory.join(STATIC_DIRECTORY_NAME));

const relative = (file: FilePath, sourceDirectory: DirectoryPath): string => f.var(file.relativeTo(sourceDirectory));

const listed = (files: FilePath[], sourceDirectory: DirectoryPath): string =>
  listedInProse(files.map((file) => relative(file, sourceDirectory)));

export const sharedLines = <Key>(claims: Shared<Key>[], sourceDirectory: DirectoryPath): string =>
  claims.map(({ key, files }) => `  • ${f.var(String(key))}: ${listed(files, sourceDirectory)}`).join('\n');

const spelt = (found: FilePath, sourceDirectory: DirectoryPath): string =>
  `spelt ${relative(found, sourceDirectory)} on disk`;

// Found by this machine's file system, which ignores case, and lost by the host.
function reportSpellings(files: MissingFile[]): void {
  if (files.some(({ foundAs }) => foundAs !== null)) {
    log.message(
      'Names are matched exactly, as the servers a portal is published to match them, so write each name as the ' +
        'file is spelt.'
    );
  }
}

const transformCommand = (flags: string[]): string =>
  [f.cmdAlt('apimatic', 'api', 'transform'), f.flag('format', 'openapi3yaml'), ...flags].join(' ');

// Quickstart refuses a spec for the same reason, and has to point at the same fix.
export const convertToOpenApi3 = (): string =>
  `Convert it with ${transformCommand([f.flag('file', '<your spec>')])}, and use the file it writes into a ` +
  `${f.var(TRANSFORMATIONS_DIRECTORY_NAME)} folder.`;

function reportSpecConversion({ file, format, converted, others }: SpecConversion) {
  const name = f.var(file.name().toString());
  const directory = f.path(file.directory());
  log.error(`No OpenAPI 3.x document found in ${directory}.` + (format === null ? '' : ` ${name} is ${format}.`));
  const command = transformCommand([
    f.flag('file', f.relative(file)),
    f.flag('destination', f.relative(file.directory()))
  ]);
  const convert = format === null ? `If ${name} is an API definition in another format, convert` : 'Convert';
  const documents = others === 1 ? 'document' : `${others} documents`;
  log.message(
    `${convert} it with:\n` +
      `  ${command}\n` +
      `then move ${f.relativePath(converted)} up into ${directory}, in place of ${name}.` +
      (others === 0 ? '' : ` Convert the other ${documents} the same way.`)
  );
}

function unreadableBecause(reason: UnreadableSpecReason): string {
  switch (reason.kind) {
    case 'empty':
      return 'it is empty';
    case 'noValue':
      return 'it holds no value';
    case 'noKey':
      return 'it is not JSON, and the portal reads YAML only when it holds a key';
    case 'gone':
      return 'it is no longer there';
    case 'folder':
      return 'it is a folder';
    case 'invalid':
    case 'unopened':
      return reason.message;
  }
}

const folderNames = (folders: DirectoryPath[], sourceDirectory: DirectoryPath): string =>
  listedInProse(folders.map((folder) => f.var(folder.relativeTo(sourceDirectory))));

function reportMissingMergedFolders(metadata: FilePath, folders: DirectoryPath[], sourceDirectory: DirectoryPath) {
  const [verb, noun] = folders.length === 1 ? ['is', 'a folder'] : ['are', 'folders'];
  log.error(
    `${relative(metadata, sourceDirectory)} merges ${folderNames(folders, sourceDirectory)}, which ${verb} not ` +
      `${noun} inside ${specPath(sourceDirectory)}.`
  );
  log.message(
    `Name each folder in ${f.var(MERGE_SETTINGS.order)} by its path from the file, spelt as on disk, case included.`
  );
}

function reportEmptyMergedFolders(metadata: FilePath, folders: DirectoryPath[], sourceDirectory: DirectoryPath) {
  const [verb, add] =
    folders.length === 1
      ? ['holds', 'its OpenAPI 3.x document to the top of the folder']
      : ['hold', "each one's OpenAPI 3.x document to the top of its folder"];
  log.error(
    `${relative(metadata, sourceDirectory)} merges ${folderNames(folders, sourceDirectory)}, which ${verb} no API ` +
      `definition.`
  );
  log.message(`Add ${add}, or list only the folders to merge in ${f.var(MERGE_SETTINGS.order)}.`);
}

/** `APIMATIC_COPILOT_URL` names no service the CLI can use; each error names the variable. */
export function reportInvalidServiceAddress(errors: string[]): void {
  log.error(errors.join('\n'));
}

/**
 * Shared by `portal generate` and `portal serve`: both read the same source directory, so
 * a broken one has to be explained the same way in both.
 */
export function reportSourceProblem(problem: PortalSourceProblem, sourceDirectory: DirectoryPath): void {
  switch (problem.kind) {
    case 'missingConfig': {
      log.error(`No ${f.var(APIMATIC_CONFIG_FILE_NAME)} found in ${f.path(sourceDirectory)}.`);
      return;
    }
    case 'invalidConfig': {
      log.error(`The ${f.var(APIMATIC_CONFIG_FILE_NAME)} in ${f.path(sourceDirectory)} is not valid:`);
      log.message(problem.errors.map((error) => `  • ${error}`).join('\n'));
      return;
    }
    case 'invalidServiceAddress': {
      reportInvalidServiceAddress(problem.errors);
      return;
    }
    case 'invalidContent': {
      reportContentProblems(problem.problems, sourceDirectory);
      return;
    }
    case 'unreadableSpec': {
      const file = relative(problem.file, sourceDirectory);
      const why = unreadableBecause(problem.reason);
      log.error(
        problem.referencedBy === null
          ? `${file} could not be read: ${why}.`
          : `${file}, which ${relative(problem.referencedBy, sourceDirectory)} refers to, could not be read: ${why}.`
      );
      return;
    }
    case 'missingSpecReference': {
      const { file, foundAs } = problem.missing;
      const referencedBy = relative(problem.referencedBy, sourceDirectory);
      const refersTo = `${referencedBy} refers to ${relative(file, sourceDirectory)}`;
      if (foundAs !== null) {
        log.error(`${refersTo}, but the file is ${spelt(foundAs, sourceDirectory)}.`);
        return;
      }
      log.error(`${refersTo}, but there is no such file.`);
      log.message(`A ${f.var('$ref')} names a file from the folder of the file it is written in.`);
      return;
    }
    case 'unresolvableSpecReference': {
      const { file, ref } = problem.reference;
      const writtenIn = relative(file, sourceDirectory);
      log.error(
        ref === ''
          ? `${writtenIn} has an empty ${f.var('$ref')}.`
          : `${writtenIn} has the ${f.var('$ref')} ${f.var(ref)}, which the portal cannot resolve.`
      );
      log.message(
        `A ${f.var('$ref')} names a part of the file it is in as ${f.var('#/components/schemas/Pet')}, ` +
          `and a part of another as ${f.var('./pets.yaml#/Pet')}.`
      );
      return;
    }
    case 'unreadableMetadata': {
      log.error(`${relative(problem.file, sourceDirectory)} could not be read as JSON.`);
      return;
    }
    case 'missingStaticFiles': {
      const one = problem.files.length === 1;
      const [subject, verb] = one ? ['A file', 'is'] : ['Files', 'are'];
      const heading = `${subject} named in ${f.var(APIMATIC_CONFIG_FILE_NAME)} ${verb} not in ${f.path(
        sourceDirectory
      )}:`;
      const lines = problem.files.map(
        ({ setting, file, foundAs }) =>
          `  • ${relative(file, sourceDirectory)}, named by ${f.var(setting)}` +
          (foundAs === null ? '' : `, which is ${spelt(foundAs, sourceDirectory)}`)
      );
      log.error(heading);
      log.message(lines.join('\n'));
      log.message(
        one
          ? 'Add the file there, or remove the setting that names it.'
          : 'Add each file there, or remove the setting that names it.'
      );
      reportSpellings(problem.files);
      return;
    }
    case 'emptySpecDirectory': {
      const extensions = listedInProse(
        SPEC_EXTENSIONS.map((extension) => f.var(extension)),
        'or'
      );
      const message =
        `${specPath(sourceDirectory)} has no API definition. Add your OpenAPI 3.x document to it as a ` +
        `${extensions} file.`;
      log.error(message);
      if (problem.folders.length > 0) {
        const folders = listedInProse(problem.folders.map((folder) => f.var(folder.leafName())));
        log.message(
          `A document in a folder inside it, such as ${folders}, is not read. Move it up, or to keep one API ` +
            `to a folder, ${mergeTheFolders()}.`
        );
      }
      return;
    }
    case 'noFoldersToMerge': {
      log.error(
        `${relative(problem.metadata, sourceDirectory)} merges the folders of ${specPath(sourceDirectory)}, which ` +
          `has none.`
      );
      log.message(
        `Put each API definition in a folder of its own there, or turn off ${f.var(MERGE_SETTINGS.mergeApis)} in ` +
          `the file.`
      );
      return;
    }
    case 'missingMergedFolders': {
      reportMissingMergedFolders(problem.metadata, problem.folders, sourceDirectory);
      return;
    }
    case 'emptyMergedFolders': {
      reportEmptyMergedFolders(problem.metadata, problem.folders, sourceDirectory);
      return;
    }
    case 'severalSpecsInFolder': {
      const shared = f.var(problem.folder.join('shared').relativeTo(sourceDirectory));
      log.error(
        `${listed(problem.files, sourceDirectory)} are each an API definition, but a folder that ` +
          `${f.var(METADATA_FILE_NAME)} merges holds one at its top, and the SDKs are built from one of them only.`
      );
      log.message(
        `Keep the definition there and move each of the others: shared parts into a folder inside it, such as ` +
          `${shared}, and another API into a folder of its own, ${addingToMergeOrder('the new folders')}.`
      );
      return;
    }
    case 'noOpenApiSpec': {
      reportSpecConversion(problem.conversion);
      return;
    }
  }
}

/** Each problem in turn, so one run lists everything a build would refuse in `content/`. */
export function reportContentProblems(problems: ContentProblem[], sourceDirectory: DirectoryPath): void {
  for (const problem of problems) {
    reportContentProblem(problem, sourceDirectory);
  }
}

function reportContentProblem(problem: ContentProblem, sourceDirectory: DirectoryPath): void {
  switch (problem.kind) {
    case 'unreadableContent': {
      log.error(
        `${contentPath(sourceDirectory)} could not be read. Check that it and every ` +
          `directory beneath it can be listed.`
      );
      return;
    }
    case 'groupNamedPages': {
      const names = listed(problem.pages, sourceDirectory);
      const one = problem.pages.length === 1;
      log.error(
        `${names} ${one ? 'is' : 'are'} named like a ${f.var('(group)')} folder, which is left out of every ` +
          `address, so the build cannot serve ${one ? 'it' : 'them'}. Rename ${one ? 'the file' : 'each file'}.`
      );
      return;
    }
    case 'reservedAddresses': {
      reportReservedAddresses(problem.pages, sourceDirectory);
      return;
    }
    case 'sharedAddresses': {
      reportSharedAddresses(problem.addresses, sourceDirectory);
      return;
    }
    case 'invalidFrontMatter': {
      log.error(`The front matter of pages in ${f.path(sourceDirectory)} would fail the build:`);
      log.message(problem.errors.map((error) => `  • ${error}`).join('\n'));
      log.message(`Start each page with front matter that gives its title, for example:\n${TITLE_EXAMPLE}`);
      return;
    }
    case 'invalidNavigation': {
      log.error(`The page order in ${f.path(sourceDirectory)} could not be applied:`);
      log.message(problem.errors.map((error) => `  • ${error}`).join('\n'));
      return;
    }
    case 'missingImages': {
      reportMissingImages(problem.images, sourceDirectory);
      return;
    }
  }
}

function reportMissingImages(images: MissingImage[], sourceDirectory: DirectoryPath): void {
  const lines = images.map(({ page, line, url, missing }) => {
    const where = `  • ${relative(page, sourceDirectory)}, line ${line}: ${f.var(url)}`;
    if (missing === null) {
      return `${where} points outside ${f.var(CONTENT_DIRECTORY_NAME)}, or into a folder the build skips`;
    }
    return missing.foundAs === null
      ? `${where}, but there is no ${relative(missing.file, sourceDirectory)}`
      : `${where}, but the file is ${spelt(missing.foundAs, sourceDirectory)}`;
  });
  log.error(
    images.length === 1
      ? `A page in ${f.path(sourceDirectory)} shows an image the build cannot find:`
      : `Pages in ${f.path(sourceDirectory)} show images the build cannot find:`
  );
  log.message(lines.join('\n'));
  log.message(
    `An image written as ${f.var('/images/logo.png')} is read from ${staticPath(sourceDirectory)}, and any ` +
      `other from beside its page in ${contentPath(sourceDirectory)}.`
  );
  reportSpellings(images.flatMap(({ missing }) => (missing === null ? [] : [missing])));
}

function reportReservedAddresses(pages: ReservedAddressPage[], sourceDirectory: DirectoryPath): void {
  const one = pages.length === 1;
  const lines = pages.map(({ file, address, keptFor }) => {
    const within = address === keptFor.address ? '' : `, under ${f.var(keptFor.address)}`;
    return `  • ${relative(file, sourceDirectory)}, at ${f.var(address)}${within}, which is kept for ${
      keptFor.description
    }`;
  });
  log.error(
    one
      ? `A page in ${f.path(sourceDirectory)} would be served where the portal puts pages of its own:`
      : `Pages in ${f.path(sourceDirectory)} would be served where the portal puts pages of its own:`
  );
  log.message(lines.join('\n'));
  log.message(one ? 'Rename or move the page.' : 'Rename or move each page.');
}

function reportSharedAddresses(addresses: SharedAddress[], sourceDirectory: DirectoryPath): void {
  const one = addresses.length === 1;
  log.error(
    `Pages in ${f.path(sourceDirectory)} would share ${one ? 'an address' : 'addresses'}, but only one page ` +
      `can be served at each:`
  );
  log.message(sharedLines(addresses, sourceDirectory));
  log.message(
    `Rename or move all but one ${one ? 'of them' : 'page at each address'}. A page in a ${f.var(
      '(group)'
    )} folder is served as if the folder were not there, and an ${f.var('index')} page at its folder's address.`
  );
}

export function reportShadowedFiles(shadowed: FileName[]): void {
  if (shadowed.length === 0) {
    return;
  }
  const names = listedInProse(shadowed.map((fileName) => f.var(fileName.toString())));
  const replaces = shadowed.length === 1 ? 'replaces the file' : 'replace the files';
  log.warn(`${names} in ${f.var('static')} ${replaces} the portal would have generated.`);
}

export function reportUnmergedSpecs(files: FilePath[], sourceDirectory: DirectoryPath): void {
  if (files.length === 0) {
    return;
  }
  const names = listed(files, sourceDirectory);
  log.warn(
    `${names} are separate API definitions, and the SDKs are generated from one of them only. To cover them all, ` +
      `give each its own folder and ${mergeTheFolders()}.`
  );
}

export function reportLeftOutSpecs(files: FilePath[], sourceDirectory: DirectoryPath): void {
  if (files.length === 0) {
    return;
  }
  const [verb, pronoun, moved, folders] =
    files.length === 1 ? ['is', 'it', 'it', 'folder'] : ['are', 'them', 'each', 'folders'];
  log.warn(
    `${listed(files, sourceDirectory)} ${verb} left out of the portal and the SDKs, as ` +
      `${f.var(METADATA_FILE_NAME)} merges only the folders beside it. To include ${pronoun}, move ${moved} into ` +
      `a folder of its own, ${addingToMergeOrder(`the ${folders}`)}.`
  );
}

export function reportIgnoredNavigationFiles(files: FilePath[], sourceDirectory: DirectoryPath): void {
  if (files.length === 0) {
    return;
  }
  const names = listed(files, sourceDirectory);
  const verb = files.length === 1 ? 'is' : 'are';
  // Not "rename it": on a case-sensitive filesystem a correctly named file may already sit
  // beside it, and the two would then need merging rather than renaming.
  log.warn(
    `${names} ${verb} not read. Only a file named ${f.var(NAVIGATION_FILE_NAME)}, in lower case, orders the pages.`
  );
}

export function reportContentNotices(notices: ContentNotices, sourceDirectory: DirectoryPath): void {
  reportHiddenPages(notices.hiddenPages, sourceDirectory);
  reportIgnoredNavigationFiles(notices.ignoredNavigationFiles, sourceDirectory);
  reportSharedTabNames(notices.sharedTabNames, sourceDirectory);
  reportNoTabsListed(notices.noTabsListed, sourceDirectory);
  reportUnseenHomeTitle(notices.unseenHomeTitle, sourceDirectory);
}

/** Nothing names these root nodes and no `tabs` says they are no tab, so the choice is put once per build. */
export function reportNoTabsListed(notice: NoTabsListed | undefined, sourceDirectory: DirectoryPath): void {
  if (notice === undefined) {
    return;
  }
  const name = (entry: TabEntry): string => {
    switch (entry.kind) {
      case 'apiReference':
        return 'the API reference';
      case 'generated':
        return entry.section.title;
      case 'folder':
        return `'${entry.name}'`;
    }
  };
  const token = (entry: TabEntry): string => {
    switch (entry.kind) {
      case 'apiReference':
        return API_REFERENCE_TOKEN;
      case 'generated':
        return entry.section.token;
      case 'folder':
        return entry.name;
    }
  };
  const names = listedInProse(notice.unplaced.map(name));
  const listing = f.var(`"tabs": ${JSON.stringify(notice.unplaced.map(token))}`);
  const file = notice.file === undefined ? undefined : relative(notice.file, sourceDirectory);
  const cause = file === undefined ? `There is no ${f.var(ROOT_NAVIGATION_FILE)}` : `${file} has no ${f.var('tabs')}`;
  const add = file === undefined ? 'Add the file with' : 'Add';
  log.warn(
    `${cause}, so nothing is a tab: the header shows no tab bar, and ${names} are folders in Home's sidebar. ` +
      `${add} ${listing} to show them as tabs, or ${f.var('"tabs": []')} to keep this sidebar.`
  );
}

export function reportUnseenHomeTitle(file: FilePath | undefined, sourceDirectory: DirectoryPath): void {
  if (file === undefined) {
    return;
  }
  log.warn(
    `${relative(file, sourceDirectory)} names the Home tab with ${f.var('title')}, but Home is the only tab ` +
      `and one tab draws no tab bar, so the name shows nowhere. Name a tab in ${f.var('tabs')}, or remove the setting.`
  );
}

export function reportSharedTabNames(shared: SharedTabName[], sourceDirectory: DirectoryPath): void {
  if (shared.length === 0) {
    return;
  }
  const describe = ({ owner, namedBy }: PortalTab): string => {
    const titledIn = namedBy === null ? '' : ` (titled in ${relative(namedBy, sourceDirectory)})`;
    switch (owner.kind) {
      case 'home':
        return `the Home tab${titledIn}`;
      case 'apiReference':
        return `the API reference${titledIn}`;
      case 'generated':
        return `the tab of ${owner.section.description}`;
      case 'folder': {
        const folder = `the tab of the ${f.var(owner.directory.leafName())} folder`;
        return namedBy === null ? `${folder} (named after the folder)` : `${folder}${titledIn}`;
      }
    }
  };
  const spellings = (tabs: PortalTab[]) =>
    listedInProse([...new Set(tabs.map(({ name }) => name))].map((name) => f.var(name)));
  log.warn('More than one tab has the same name, or one that differs only in case, so readers cannot tell them apart:');
  log.message(shared.map(({ tabs }) => `  • ${spellings(tabs)}: ${listedInProse(tabs.map(describe))}`).join('\n'));
  log.message(
    `Rename all but one tab of each name with a ${f.var('title')} in its folder's ` +
      `${f.var(NAVIGATION_FILE_NAME)}, or in ${f.var(ROOT_NAVIGATION_FILE)} for the Home tab; the SDKs and ` +
      `Context Plugin sections keep their names.`
  );
}

export function reportHiddenPages(files: FilePath[], sourceDirectory: DirectoryPath): void {
  if (files.length === 0) {
    return;
  }
  const names = listed(files, sourceDirectory);
  const [verb, pronoun] = files.length === 1 ? ['sits', 'it'] : ['sit', 'them'];
  log.warn(
    `${names} ${verb} inside a specification's section under ${f.var('content/api')}, which lists only ` +
      `its own reference pages, so ${pronoun} will not appear in the sidebar. Move ${pronoun} elsewhere ` +
      `in ${f.var('content')}.`
  );
}
