import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../infrastructure/service-error.js';
import { PortalAuthorizationFailure } from '../../infrastructure/services/portal-authorization-service.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileName } from '../../types/file/fileName.js';
import { ContentNotices } from '../../types/portal/content-notices.js';
import { MissingArtifacts } from '../../types/portal/generated-pages.js';
import { PortalArtifacts } from '../../types/portal/portal-artifacts.js';
import { PortalSourceProblem } from '../../types/portal/portal-source.js';
import { format as f } from '../format.js';
import { describeMissingArtifacts, generateArtifacts } from './artifacts.js';
import { reportAuthorizationFailure } from './authorization.js';
import { reportUnplacedSamples } from './code-samples.js';
import { reportContentNotices, reportShadowedFiles, reportSourceProblem } from './source.js';
import { FileDownloadResponse } from '../../infrastructure/services/file-download-service.js';
import { FileProblem } from '../../types/file/file-problem.js';
import { withSpinner } from '../prompt.js';
import { reportInvalidSpec } from '../api/invalid-spec.js';

const META_FILE_NAME = 'APIMATIC-META.json';

/** What both `portal generate` and `portal serve` say while the project they share is prepared. */
export class PreparePortalProjectPrompts {
  public runtimeUnsupported(reason: string) {
    log.error(reason);
  }

  public authorizationFailed(failure: PortalAuthorizationFailure) {
    reportAuthorizationFailure(failure);
  }

  public downloadDefaultMeta(fn: Promise<Result<FileDownloadResponse, ServiceError>>) {
    return withSpinner(
      `Downloading the default ${f.var(META_FILE_NAME)}`,
      `Default ${f.var(META_FILE_NAME)} downloaded.`,
      `Unable to download the default ${f.var(META_FILE_NAME)}.`,
      fn
    );
  }

  public defaultMetaNotDownloaded(error: ServiceError) {
    log.error(
      `${error.errorMessage} Your spec directory has no ${f.var(META_FILE_NAME)}, and the default one ` +
        `could not be downloaded. Add an ${f.var(META_FILE_NAME)} to it and try again.`
    );
  }

  public specNotArchived(problem: FileProblem) {
    log.error(`The spec directory could not be zipped for validation: ${problem.reason}`);
  }

  /** `commandName` is the command to run again, as oclif names it (`portal:serve`). */
  public specInvalid(commandName: string) {
    reportInvalidSpec('file');
    log.info(`Fix your API Definition, then run ${f.cmdAlt('apimatic', ...commandName.split(/[: ]/))} again.`);
  }

  public generateArtifacts(fn: Promise<Result<PortalArtifacts, ServiceError>>) {
    return generateArtifacts(fn);
  }

  public sourceProblem(problem: PortalSourceProblem, sourceDirectory: DirectoryPath) {
    reportSourceProblem(problem, sourceDirectory);
  }

  public filesShadowedByStatic(shadowed: FileName[]) {
    reportShadowedFiles(shadowed);
  }

  public contentNotices(notices: ContentNotices, sourceDirectory: DirectoryPath) {
    reportContentNotices(notices, sourceDirectory);
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
