import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError, ServiceErrorCode } from '../../infrastructure/service-error.js';
import { PortalAuthorizationFailure } from '../../infrastructure/services/portal-authorization-service.js';
import { APIMATIC_CONFIG_FILE_NAME } from '../../types/apimatic-config/document.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileName } from '../../types/file/fileName.js';
import { FileProblem } from '../../types/file/file-problem.js';
import { FilePath } from '../../types/file/filePath.js';
import { SharedEndpoint, UnplacedSamples } from '../../types/portal/code-samples.js';
import { ContentNotices } from '../../types/portal/content-notices.js';
import { MissingArtifacts } from '../../types/portal/generated-pages.js';
import { COPILOT_URL_VARIABLE, ServiceAddress } from '../../types/portal/config/service-address.js';
import { LookupOutcome } from '../../types/portal/copilot/portal-key-outcomes.js';
import { PortalArtifacts } from '../../types/portal/portal-artifacts.js';
import { PortalSourceProblem } from '../../types/portal/portal-source.js';
import { format as f } from '../format.js';
import { notZippedForUpload, withSpinner } from '../prompt.js';
import { describeMissingArtifacts, generateArtifacts } from './artifacts.js';
import { reportAuthorizationFailure } from './authorization.js';
import { reportSharedEndpoints, reportUnplacedSamples } from './code-samples.js';
import {
  reportContentNotices,
  reportLeftOutSpecs,
  reportShadowedFiles,
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

  public askAiNotEntitled(failure: PortalAuthorizationFailure, sourceDirectory: DirectoryPath) {
    reportAuthorizationFailure(failure);
    const config = new FilePath(sourceDirectory, new FileName(APIMATIC_CONFIG_FILE_NAME));
    log.message(
      `To build the portal without its Ask AI chat, remove ${f.var('ai.copilot')} from the ${f.var('portal')} ` +
        `block of ${f.path(config)}.`
    );
  }

  public copilotKeyUnrecognized(sourceDirectory: DirectoryPath) {
    const config = new FilePath(sourceDirectory, new FileName(APIMATIC_CONFIG_FILE_NAME));
    log.error(
      `The ${f.var('portal.ai.copilot.key')} in ${f.path(config)} is not an Ask AI key. Run ` +
        `${f.cmdAlt('apimatic', 'portal', 'copilot', 'enable')} ${f.flag('rotate')} to replace it with a new one, ` +
        `or remove ${f.var('ai.copilot')} to build the portal without its Ask AI chat.`
    );
  }

  public lookUpCopilotKey(fn: Promise<Result<LookupOutcome, ServiceError>>) {
    return withSpinner('Checking the Ask AI key', 'Checked.', 'Not checked.', fn);
  }

  public copilotKeyNotRegistered(outcome: Exclude<LookupOutcome, 'registered'>, sourceDirectory: DirectoryPath) {
    const config = new FilePath(sourceDirectory, new FileName(APIMATIC_CONFIG_FILE_NAME));
    const enable = f.cmdAlt('apimatic', 'portal', 'copilot', 'enable');
    const key = `${f.var('portal.ai.copilot.key')} in ${f.path(config)}`;
    log.error(
      outcome === 'unknown'
        ? `The Ask AI service does not know the ${key}, or it was revoked. Check the key, or run ${enable} to ` +
            `register the portal with Ask AI.`
        : `The ${key} belongs to another APIMatic account. Run ${enable} ${f.flag('rotate')} to give this portal a ` +
            `key of its own.`
    );
  }

  /** The portal is still built: whether the key works is only known once a visitor asks. */
  public copilotKeyNotChecked(error: ServiceError, service: ServiceAddress) {
    const reason =
      error.code === ServiceErrorCode.NetworkError
        ? `${f.link(service.toString())} could not be reached`
        : `${f.link(service.toString())} answered: ${error.errorMessage}`;
    log.warn(
      `The portal's Ask AI key could not be checked, because ${reason}. The portal is built anyway; if the ` +
        `service does not know the key, its chat will not work. Check ${f.var(COPILOT_URL_VARIABLE)} if you set it.`
    );
  }

  public sourceNotZipped(problem: FileProblem, sourceDirectory: DirectoryPath) {
    log.error(notZippedForUpload(sourceDirectory, problem.reason));
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

  public unplacedSamples(unplaced: UnplacedSamples[], sourceDirectory: DirectoryPath) {
    reportUnplacedSamples(unplaced, sourceDirectory);
  }

  // A run delivers everything or nothing, so a gap is the server's, and trying again is the fix.
  public artifactsIncomplete(missing: MissingArtifacts) {
    log.error(
      `The portal artifacts did not include ${describeMissingArtifacts(missing)}, which the portal's pages ` +
        `need. Try again, and if it keeps happening, reach out to our team at ${f.var('support@apimatic.io')}.`
    );
  }
}
