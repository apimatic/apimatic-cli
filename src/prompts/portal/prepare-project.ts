import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';
import { PortalArtifacts, PortalArtifactsProblem } from '../../types/portal/portal-artifacts.js';
import { PortalSourceProblem } from '../../types/portal/portal-source.js';
import { generateArtifacts, reportUnplacedSamples } from './code-samples.js';
import { reportHiddenPages, reportIgnoredNavigationFiles, reportShadowedFiles, reportSourceProblem } from './source.js';

/** What both `portal generate` and `portal serve` say while the project they share is prepared. */
export class PreparePortalProjectPrompts {
  public generateArtifacts(fn: Promise<Result<PortalArtifacts, ServiceError | PortalArtifactsProblem>>) {
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

  public runtimeUnsupported(reason: string) {
    log.error(reason);
  }
}
