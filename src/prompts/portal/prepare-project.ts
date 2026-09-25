import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';
import { PortalArtifacts } from '../../types/portal/portal-artifacts.js';
import { PortalSourceProblem } from '../../types/portal/portal-source.js';
import { SharedTabName } from '../../types/portal/portal-tabs.js';
import { generateArtifacts, reportUnplacedSamples } from './code-samples.js';
import {
  reportFolderTabs,
  reportHiddenPages,
  reportIgnoredNavigationFiles,
  reportShadowedFiles,
  reportSharedTabNames,
  reportSourceProblem
} from './source.js';

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

  public folderTabs(folders: DirectoryPath[]) {
    reportFolderTabs(folders);
  }

  public sharedTabNames(shared: SharedTabName[], sourceDirectory: DirectoryPath) {
    reportSharedTabNames(shared, sourceDirectory);
  }

  public unplacedSamples(endpoints: string[]) {
    reportUnplacedSamples(endpoints);
  }

  public runtimeUnsupported(reason: string) {
    log.error(reason);
  }
}
