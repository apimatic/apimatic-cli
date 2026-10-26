import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { PortalAuthorizationFailure } from '../../infrastructure/services/portal-authorization-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';
import { ContentNotices } from '../../types/portal/content-notices.js';
import { MissingArtifacts } from '../../types/portal/generated-pages.js';
import { PortalArtifacts } from '../../types/portal/portal-artifacts.js';
import { PortalSourceProblem, SharedEndpoint } from '../../types/portal/portal-source.js';
import { format as f } from '../format.js';
import { describeMissingArtifacts, generateArtifacts } from './artifacts.js';
import { reportAuthorizationFailure } from './authorization.js';
import { reportUnplacedSamples } from './code-samples.js';
import {
  reportContentNotices,
  reportLeftOutSpecs,
  reportShadowedFiles,
  reportSharedEndpoints,
  reportSourceProblem,
  reportUnmergedSpecs
} from './source.js';

/** What both `portal generate` and `portal serve` say while the project they share is prepared. */
export class PreparePortalProjectPrompts {
  public runtimeUnsupported(reason: string) {
    log.error(reason);
  }

  public networkShareUnsupported(sourceDirectory: DirectoryPath) {
    log.error(
      `A portal can't be built or previewed from a network share, and ${f.path(sourceDirectory)} is on one. ` +
        `Copy the folder to a local drive, or map the share to a drive letter, and use that path instead.`
    );
  }

  public authorizationFailed(failure: PortalAuthorizationFailure) {
    reportAuthorizationFailure(failure);
  }

  public generateArtifacts(fn: Promise<Result<PortalArtifacts, ServiceError>>) {
    return generateArtifacts(fn);
  }

  public sourceProblem(problem: PortalSourceProblem, sourceDirectory: DirectoryPath) {
    reportSourceProblem(problem, sourceDirectory);
    const noPortalBlock =
      problem.kind === 'missingConfig' || (problem.kind === 'invalidConfig' && problem.missingPortal);
    if (noPortalBlock) {
      log.message(
        `Run ${f.cmdAlt('apimatic', 'quickstart')} in an empty directory with a sample spec to see an example of ` +
          `a valid portal.`
      );
    }
  }

  public filesShadowedByStatic(shadowed: FileName[]) {
    reportShadowedFiles(shadowed);
  }

  public contentNotices(notices: ContentNotices, sourceDirectory: DirectoryPath) {
    reportContentNotices(notices, sourceDirectory);
  }

  public unmergedSpecs(files: FilePath[], sourceDirectory: DirectoryPath) {
    reportUnmergedSpecs(files, sourceDirectory);
  }

  public leftOutSpecs(files: FilePath[], sourceDirectory: DirectoryPath) {
    reportLeftOutSpecs(files, sourceDirectory);
  }

  public sharedEndpoints(shared: SharedEndpoint[], sourceDirectory: DirectoryPath) {
    reportSharedEndpoints(shared, sourceDirectory);
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
}
