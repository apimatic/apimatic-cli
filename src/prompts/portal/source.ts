import { log } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PortalMigration, PortalSourceProblem } from '../../types/portal/portal-source.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';
import { format as f } from '../format.js';
import { noteWrapped } from '../prompt.js';

/**
 * Shared by `portal generate` and `portal serve`: both read the same source directory, so
 * a broken one has to be explained the same way in both.
 */
export function reportSourceProblem(problem: PortalSourceProblem, sourceDirectory: DirectoryPath): void {
  switch (problem.kind) {
    case 'missingConfig': {
      log.error(`No ${f.var('portal.json')} found in ${f.path(sourceDirectory)}.`);
      if (problem.migration === null) {
        log.message(`Run ${f.cmdAlt('apimatic', 'quickstart')} to set up a portal.`);
      } else {
        reportMigration(problem.migration, sourceDirectory);
      }
      return;
    }
    case 'invalidConfig': {
      log.error(`The ${f.var('portal.json')} in ${f.path(sourceDirectory)} is not valid:`);
      log.message(problem.errors.map((error) => `  • ${error}`).join('\n'));
      return;
    }
    case 'invalidNavigation': {
      log.error(`The page order in ${f.path(sourceDirectory)} could not be applied:`);
      log.message(problem.errors.map((error) => `  • ${error}`).join('\n'));
      return;
    }
    case 'unreadableContent': {
      log.error(
        `${f.path(sourceDirectory.join('content'))} could not be read. Check that it and every ` +
          `directory beneath it can be listed.`
      );
      return;
    }
    case 'unreadableSpec': {
      log.error(`${f.var(problem.fileName.toString())} could not be read as JSON or YAML.`);
      return;
    }
    case 'unsupportedSpec': {
      const message =
        `${f.var(problem.fileName.toString())} is ${problem.format}. ` +
        `Portals are generated from OpenAPI 3.x documents; convert it with ` +
        `${f.cmdAlt('apimatic', 'api', 'transform')} first.`;
      log.error(message);
      return;
    }
    case 'missingLogo': {
      const message =
        `The logo ${f.var(problem.logoPath)} named in ${f.var('portal.json')} is not in ` +
        `${f.path(sourceDirectory)}. Add the image there, or remove ${f.var('logo')}.`;
      log.error(message);
      return;
    }
    case 'noSpecs': {
      const message =
        `No OpenAPI 3.x document found in ${f.path(sourceDirectory.join('spec'))}. ` +
        `Add at least one ${f.var('.json')}, ${f.var('.yaml')} or ${f.var('.yml')} file.`;
      log.error(message);
      return;
    }
  }
}

export function reportShadowedFiles(shadowed: FileName[]): void {
  if (shadowed.length === 0) {
    return;
  }
  const names = shadowed.map((fileName) => f.var(fileName.toString())).join(', ');
  log.warn(`${names} in ${f.var('static')} replaces the file the portal would have generated.`);
}

export function reportIgnoredNavigationFiles(files: FilePath[], sourceDirectory: DirectoryPath): void {
  if (files.length === 0) {
    return;
  }
  const names = files.map((file) => f.var(file.relativeTo(sourceDirectory))).join(', ');
  const [verb, pronoun] = files.length === 1 ? ['is', 'it'] : ['are', 'them'];
  log.warn(`${names} ${verb} not read. Name ${pronoun} ${f.var('nav.json')}, in lower case, to order the pages.`);
}

export function reportHiddenPages(files: FilePath[], sourceDirectory: DirectoryPath): void {
  if (files.length === 0) {
    return;
  }
  const names = files.map((file) => f.var(file.relativeTo(sourceDirectory))).join(', ');
  const [verb, pronoun] = files.length === 1 ? ['sits', 'it'] : ['sit', 'them'];
  log.warn(
    `${names} ${verb} inside a specification's section under ${f.var('content/api')}, which lists only ` +
      `its own reference pages, so ${pronoun} will not appear in the sidebar. Move ${pronoun} elsewhere ` +
      `in ${f.var('content')}.`
  );
}

function reportMigration(migration: PortalMigration, sourceDirectory: DirectoryPath): void {
  const starter = JSON.stringify(migration.suggestedConfig, null, 2);
  const lines = [
    `This project still uses ${f.var('APIMATIC-BUILD.json')}, which no longer configures the portal.`,
    '',
    `Create ${f.var('portal.json')} next to it with:`,
    starter
  ];

  if (migration.unmigratableLogo !== null) {
    lines.push(
      '',
      `The logo at ${f.var(migration.unmigratableLogo)} is not carried over: ${f.var('logo')} addresses ` +
        `the ${f.var('static')} directory. Move the image under ${f.path(sourceDirectory.join('static'))} ` +
        `and add it as ${f.var('"logo": "static/<path>"')}.`
    );
  }

  if (migration.unsupportedFields.length > 0) {
    lines.push(
      '',
      'These settings have no equivalent yet and are ignored:',
      ...migration.unsupportedFields.map((field) => `  • ${field}`)
    );
  }

  noteWrapped(lines.join('\n'), 'Migrating from APIMATIC-BUILD.json');
}
