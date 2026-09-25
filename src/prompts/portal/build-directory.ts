import { log } from '@clack/prompts';
import { APIMATIC_CONFIG_FILE_NAME } from '../../types/apimatic-config/document.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PortalBuildDirectoryProblem, ReservedAddressPage } from '../../types/portal/portal-build-directory.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';
import { format as f } from '../format.js';

/**
 * Shared by `portal generate` and `portal serve`: both read the same build directory, so
 * a broken one has to be explained the same way in both. `offerQuickstart` is false once a
 * preview of the directory is running: quickstart refuses a directory that is not empty.
 */
export function reportBuildDirectoryProblem(
  problem: PortalBuildDirectoryProblem,
  buildDirectory: DirectoryPath,
  { offerQuickstart = true }: { offerQuickstart?: boolean } = {}
): void {
  const quickstart = `Run ${f.cmdAlt('apimatic', 'quickstart')} to set up a portal.`;
  switch (problem.kind) {
    case 'missingConfig': {
      log.error(`No ${f.var(APIMATIC_CONFIG_FILE_NAME)} found in ${f.path(buildDirectory)}.`);
      if (offerQuickstart) {
        log.message(quickstart);
      }
      return;
    }
    case 'invalidConfig': {
      log.error(`The ${f.var(APIMATIC_CONFIG_FILE_NAME)} in ${f.path(buildDirectory)} is not valid:`);
      log.message(problem.errors.map((error) => `  • ${error}`).join('\n'));
      // A file without the block is no worse off than no file: the same command sets it up.
      if (problem.missingPortal && offerQuickstart) {
        log.message(quickstart);
      }
      return;
    }
    case 'invalidNavigation': {
      log.error(`The page order in ${f.path(buildDirectory)} could not be applied:`);
      log.message(problem.errors.map((error) => `  • ${error}`).join('\n'));
      return;
    }
    case 'reservedAddresses': {
      reportReservedAddresses(problem.pages, buildDirectory);
      return;
    }
    case 'unreadableContent': {
      log.error(
        `${f.path(buildDirectory.join('content'))} could not be read. Check that it and every ` +
          `directory beneath it can be listed.`
      );
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
        buildDirectory
      )}:`;
      const relative = (file: FilePath) => f.var(file.relativeTo(buildDirectory));
      const lines = problem.files.map(
        ({ setting, file, foundAs }) =>
          `  • ${relative(file)}, named by ${f.var(setting)}` +
          (foundAs === null ? '' : `, which is spelt ${relative(foundAs)} on disk`)
      );
      log.error(heading);
      log.message(lines.join('\n'));
      log.message(
        one
          ? 'Add the file there, or remove the setting that names it.'
          : 'Add each file there, or remove the setting that names it.'
      );
      // Found by this machine's file system, which ignores case, and lost by the host.
      if (problem.files.some(({ foundAs }) => foundAs !== null)) {
        log.message(
          'Names are matched exactly, as the servers a portal is published to match them, ' +
            'so spell the setting as the file is spelt.'
        );
      }
      return;
    }
    case 'emptySpecDirectory': {
      const message =
        `${f.path(buildDirectory.join('spec'))} has no files. Add your OpenAPI 3.x document to it as a ` +
        `${f.var('.json')}, ${f.var('.yaml')} or ${f.var('.yml')} file.`;
      log.error(message);
      return;
    }
    case 'noOpenApiSpec': {
      const message =
        `No OpenAPI 3.x document found in ${f.path(buildDirectory.join('spec'))}. ` +
        `Try ${f.cmdAlt('apimatic', 'api', 'transform')} to convert your spec to OpenAPI 3.x first.`;
      log.error(message);
      return;
    }
  }
}

function reportReservedAddresses(pages: ReservedAddressPage[], buildDirectory: DirectoryPath): void {
  const one = pages.length === 1;
  const lines = pages.map(({ file, address, section }) => {
    const kept = `/${section.folder}`;
    const within = address === kept ? '' : `, under ${f.var(kept)}`;
    return `  • ${f.var(file.relativeTo(buildDirectory))}, at ${f.var(address)}${within}, which is kept for ${
      section.description
    }`;
  });
  log.error(
    one
      ? `A page in ${f.path(buildDirectory)} would be served where the portal puts the pages it generates:`
      : `Pages in ${f.path(buildDirectory)} would be served where the portal puts the pages it generates:`
  );
  log.message(lines.join('\n'));
  log.message(one ? 'Rename or move the page.' : 'Rename or move each page.');
}

export function reportShadowedFiles(shadowed: FileName[]): void {
  if (shadowed.length === 0) {
    return;
  }
  const names = shadowed.map((fileName) => f.var(fileName.toString())).join(', ');
  log.warn(`${names} in ${f.var('static')} replaces the file the portal would have generated.`);
}

export function reportIgnoredNavigationFiles(files: FilePath[], buildDirectory: DirectoryPath): void {
  if (files.length === 0) {
    return;
  }
  const names = files.map((file) => f.var(file.relativeTo(buildDirectory))).join(', ');
  const verb = files.length === 1 ? 'is' : 'are';
  // Not "rename it": on a case-sensitive filesystem a correctly named file may already sit
  // beside it, and the two would then need merging rather than renaming.
  log.warn(`${names} ${verb} not read. Only a file named ${f.var('nav.json')}, in lower case, orders the pages.`);
}

export function reportHiddenPages(files: FilePath[], buildDirectory: DirectoryPath): void {
  if (files.length === 0) {
    return;
  }
  const names = files.map((file) => f.var(file.relativeTo(buildDirectory))).join(', ');
  const [verb, pronoun] = files.length === 1 ? ['sits', 'it'] : ['sit', 'them'];
  log.warn(
    `${names} ${verb} inside a specification's section under ${f.var('content/api')}, which lists only ` +
      `its own reference pages, so ${pronoun} will not appear in the sidebar. Move ${pronoun} elsewhere ` +
      `in ${f.var('content')}.`
  );
}
