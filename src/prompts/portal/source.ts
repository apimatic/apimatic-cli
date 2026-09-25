import { log } from '@clack/prompts';
import { APIMATIC_CONFIG_FILE_NAME } from '../../types/apimatic-config/document.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { listedInProse } from '../../utils/string-utils.js';
import { ContentNotices } from '../../types/portal/content-notices.js';
import { NAVIGATION_FILE_NAME } from '../../types/portal/portal-navigation.js';
import {
  ContentProblem,
  MissingFile,
  MissingImage,
  PortalSourceProblem,
  ReservedAddressPage,
  SharedAddress,
  SpecConversion
} from '../../types/portal/portal-source.js';
import { TRANSFORMATIONS_DIRECTORY_NAME } from '../../types/transform-context.js';
import { PortalTab, SharedTabName } from '../../types/portal/portal-tabs.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';
import { CONTENT_DIRECTORY_NAME, SPEC_DIRECTORY_NAME, STATIC_DIRECTORY_NAME } from '../../types/project-layout.js';
import { format as f } from '../format.js';

const TITLE_EXAMPLE = ['---', 'title: Getting started', '---'].join('\n');

const ROOT_NAVIGATION_FILE = `${CONTENT_DIRECTORY_NAME}/${NAVIGATION_FILE_NAME}`;

export const specPath = (sourceDirectory: DirectoryPath): string => f.path(sourceDirectory.join(SPEC_DIRECTORY_NAME));

export const contentPath = (sourceDirectory: DirectoryPath): string =>
  f.path(sourceDirectory.join(CONTENT_DIRECTORY_NAME));

export const staticPath = (sourceDirectory: DirectoryPath): string =>
  f.path(sourceDirectory.join(STATIC_DIRECTORY_NAME));

const relative = (file: FilePath, sourceDirectory: DirectoryPath): string => f.var(file.relativeTo(sourceDirectory));

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

function reportSpecConversion({ file, format, converted, others }: SpecConversion, sourceDirectory: DirectoryPath) {
  const name = f.var(file.name().toString());
  log.error(
    `No OpenAPI 3.x document found in ${specPath(sourceDirectory)}.` + (format === null ? '' : ` ${name} is ${format}.`)
  );
  const command = transformCommand([
    f.flag('file', f.relative(file)),
    f.flag('destination', f.relative(file.directory()))
  ]);
  log.message(
    `${format === null ? `If ${name} is an API definition in another format, convert` : 'Convert'} it with:\n` +
      `  ${command}\n` +
      `then move ${f.relativePath(converted)} up into ${specPath(sourceDirectory)}, which is the only folder read.` +
      (others === 0 ? '' : ` Convert the other ${others === 1 ? 'document' : `${others} documents`} the same way.`)
  );
}

/**
 * Shared by `portal generate` and `portal serve`: both read the same source directory, so
 * a broken one has to be explained the same way in both. `offerQuickstart` is false once a
 * preview of the directory is running: quickstart refuses a directory that is not empty.
 */
export function reportSourceProblem(
  problem: PortalSourceProblem,
  sourceDirectory: DirectoryPath,
  { offerQuickstart = true }: { offerQuickstart?: boolean } = {}
): void {
  const quickstart = `Run ${f.cmdAlt('apimatic', 'quickstart')} to set up a portal.`;
  switch (problem.kind) {
    case 'missingConfig': {
      log.error(`No ${f.var(APIMATIC_CONFIG_FILE_NAME)} found in ${f.path(sourceDirectory)}.`);
      if (offerQuickstart) {
        log.message(quickstart);
      }
      return;
    }
    case 'invalidConfig': {
      log.error(`The ${f.var(APIMATIC_CONFIG_FILE_NAME)} in ${f.path(sourceDirectory)} is not valid:`);
      log.message(problem.errors.map((error) => `  • ${error}`).join('\n'));
      // A file without the block is no worse off than no file: the same command sets it up.
      if (problem.missingPortal && offerQuickstart) {
        log.message(quickstart);
      }
      return;
    }
    case 'invalidContent': {
      reportContentProblems(problem.problems, sourceDirectory);
      return;
    }
    case 'unreadableSpec': {
      log.error(`${f.var(problem.fileName.toString())} could not be read as JSON or YAML.`);
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
      const message =
        `${specPath(sourceDirectory)} has no files. Add your OpenAPI 3.x document to it as a ` +
        `${f.var('.json')}, ${f.var('.yaml')} or ${f.var('.yml')} file.`;
      log.error(message);
      if (problem.folders.length > 0) {
        const folders = listedInProse(problem.folders.map((folder) => f.var(folder.leafName())));
        log.message(`A document in a folder inside it, such as ${folders}, is not read: move it up.`);
      }
      return;
    }
    case 'noOpenApiSpec': {
      reportSpecConversion(problem.conversion, sourceDirectory);
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
      const names = listedInProse(problem.pages.map((page) => relative(page, sourceDirectory)));
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
  const lines = pages.map(({ file, address, section }) => {
    const kept = `/${section.folder}`;
    const within = address === kept ? '' : `, under ${f.var(kept)}`;
    return `  • ${relative(file, sourceDirectory)}, at ${f.var(address)}${within}, which is kept for ${
      section.description
    }`;
  });
  log.error(
    one
      ? `A page in ${f.path(sourceDirectory)} would be served where the portal puts the pages it generates:`
      : `Pages in ${f.path(sourceDirectory)} would be served where the portal puts the pages it generates:`
  );
  log.message(lines.join('\n'));
  log.message(one ? 'Rename or move the page.' : 'Rename or move each page.');
}

function reportSharedAddresses(addresses: SharedAddress[], sourceDirectory: DirectoryPath): void {
  const one = addresses.length === 1;
  const lines = addresses.map(
    ({ address, pages }) =>
      `  • ${f.var(address)}: ${listedInProse(pages.map((page) => relative(page, sourceDirectory)))}`
  );
  log.error(
    `Pages in ${f.path(sourceDirectory)} would share ${one ? 'an address' : 'addresses'}, but only one page ` +
      `can be served at each:`
  );
  log.message(lines.join('\n'));
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

export function reportIgnoredNavigationFiles(files: FilePath[], sourceDirectory: DirectoryPath): void {
  if (files.length === 0) {
    return;
  }
  const names = listedInProse(files.map((file) => relative(file, sourceDirectory)));
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
  reportFolderTabs(notices.folderTabs);
  reportSharedTabNames(notices.sharedTabNames, sourceDirectory);
}

export function reportFolderTabs(folders: DirectoryPath[]): void {
  if (folders.length === 0) {
    return;
  }
  const names = listedInProse(folders.map((folder) => f.var(folder.leafName())));
  log.info(`${f.var(ROOT_NAVIGATION_FILE)} makes a tab of each folder it lists: ${names}.`);
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
      `${f.var(NAVIGATION_FILE_NAME)}, or in ${f.var(ROOT_NAVIGATION_FILE)} for the Home tab; the tabs of the ` +
      `SDK pages and the context plugin keep their names.`
  );
}

export function reportHiddenPages(files: FilePath[], sourceDirectory: DirectoryPath): void {
  if (files.length === 0) {
    return;
  }
  const names = listedInProse(files.map((file) => relative(file, sourceDirectory)));
  const [verb, pronoun] = files.length === 1 ? ['sits', 'it'] : ['sit', 'them'];
  log.warn(
    `${names} ${verb} inside a specification's section under ${f.var('content/api')}, which lists only ` +
      `its own reference pages, so ${pronoun} will not appear in the sidebar. Move ${pronoun} elsewhere ` +
      `in ${f.var('content')}.`
  );
}
