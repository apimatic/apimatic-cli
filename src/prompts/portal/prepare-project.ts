import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';
import { MissingArtifacts } from '../../types/portal/generated-pages.js';
import { PortalArtifacts } from '../../types/portal/portal-artifacts.js';
import { PortalSourceProblem } from '../../types/portal/portal-source.js';
import { format as f } from '../format.js';
import { describeMissingArtifacts, generateArtifacts, reportUnplacedSamples } from './code-samples.js';
import { reportHiddenPages, reportIgnoredNavigationFiles, reportShadowedFiles, reportSourceProblem } from './source.js';

/** What both `portal generate` and `portal serve` say while the project they share is prepared. */
export class PreparePortalProjectPrompts {
  public generateArtifacts(fn: Promise<Result<PortalArtifacts, ServiceError>>) {
    return generateArtifacts(fn);
  }

  public sourceProblem(problem: PortalSourceProblem, sourceDirectory: DirectoryPath) {
    reportSourceProblem(problem, sourceDirectory);
  }

  public filesShadowedByStatic(shadowed: FileName[]) {
    reportShadowedFiles(shadowed);
  }

  public pagesHiddenBySpecs(files: FilePath[], sourceDirectory: DirectoryPath) {
    reportHiddenPages(files, sourceDirectory);
  }

  public ignoredNavigationFiles(files: FilePath[], sourceDirectory: DirectoryPath) {
    reportIgnoredNavigationFiles(files, sourceDirectory);
  }

  public unplacedSamples(endpoints: string[]) {
    reportUnplacedSamples(endpoints);
  }

  // A run delivers everything or nothing, so a gap is the server's, and trying again is the fix.
  public artifactsIncomplete(missing: MissingArtifacts) {
    log.error(
      `The portal artifacts did not include ${describeMissingArtifacts(missing)}, which the portal's pages ` +
        `need. Try again, and if it keeps happening, reach out to our team at ${f.var('support@apimatic.io')}.`
    );
  }

  public runtimeUnsupported(reason: string) {
    log.error(reason);
  }
}
