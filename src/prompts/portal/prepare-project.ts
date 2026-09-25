import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';
import { PortalArtifacts } from '../../types/portal/portal-artifacts.js';
import { PortalBuildDirectoryProblem } from '../../types/portal/portal-build-directory.js';
import { generateArtifacts, reportUnplacedSamples } from './code-samples.js';
import {
  reportHiddenPages,
  reportIgnoredNavigationFiles,
  reportShadowedFiles,
  reportBuildDirectoryProblem
} from './build-directory.js';

/** What both `portal generate` and `portal serve` say while the project they share is prepared. */
export class PreparePortalProjectPrompts {
  public generateArtifacts(fn: Promise<Result<PortalArtifacts, ServiceError>>) {
    return generateArtifacts(fn);
  }

  public buildDirectoryProblem(problem: PortalBuildDirectoryProblem, buildDirectory: DirectoryPath) {
    reportBuildDirectoryProblem(problem, buildDirectory);
  }

  public filesShadowedByStatic(shadowed: FileName[]) {
    reportShadowedFiles(shadowed);
  }

  public pagesHiddenBySpecs(files: FilePath[], buildDirectory: DirectoryPath) {
    reportHiddenPages(files, buildDirectory);
  }

  public ignoredNavigationFiles(files: FilePath[], buildDirectory: DirectoryPath) {
    reportIgnoredNavigationFiles(files, buildDirectory);
  }

  public unplacedSamples(endpoints: string[]) {
    reportUnplacedSamples(endpoints);
  }

  public runtimeUnsupported(reason: string) {
    log.error(reason);
  }
}
