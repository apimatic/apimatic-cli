import { log } from '@clack/prompts';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { PortalMigration, PortalSourceProblem } from '../../types/portal/portal-source.js';
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
        reportMigration(problem.migration);
      }
      return;
    }
    case 'invalidConfig': {
      log.error(`The ${f.var('portal.json')} in ${f.path(sourceDirectory)} is not valid:`);
      log.message(problem.errors.map((error) => `  • ${error}`).join('\n'));
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
    case 'noSpecs': {
      const message =
        `No OpenAPI 3.x document found in ${f.path(sourceDirectory.join('spec'))}. ` +
        `Add at least one ${f.var('.json')}, ${f.var('.yaml')} or ${f.var('.yml')} file.`;
      log.error(message);
      return;
    }
  }
}

function reportMigration(migration: PortalMigration): void {
  const starter = JSON.stringify(migration.suggestedConfig, null, 2);
  const lines = [
    `This project still uses ${f.var('APIMATIC-BUILD.json')}, which no longer configures the portal.`,
    '',
    `Create ${f.var('portal.json')} next to it with:`,
    starter
  ];

  if (migration.unsupportedFields.length > 0) {
    lines.push(
      '',
      'These settings have no equivalent yet and are ignored:',
      ...migration.unsupportedFields.map((field) => `  • ${field}`)
    );
  }

  noteWrapped(lines.join('\n'), 'Migrating from APIMATIC-BUILD.json');
}
