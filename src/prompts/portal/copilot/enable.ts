import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../../infrastructure/service-error.js';
import { RegistrationOutcome, RevocationOutcome } from '../../../infrastructure/services/copilot-portal-service.js';
import { APIMATIC_CONFIG_FILE_NAME } from '../../../types/apimatic-config/document.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { FileName } from '../../../types/file/fileName.js';
import { FilePath } from '../../../types/file/filePath.js';
import { ServiceAddress } from '../../../types/portal/config/service-address.js';
import { CopilotKey, CopilotKeyKind, CopilotKeyProblem } from '../../../types/portal/copilot/copilot-key.js';
import { CopilotRegistrationProblem } from '../../../types/portal/copilot/copilot-registration.js';
import { PortalScaffoldProblem, PortalSourceProblem } from '../../../types/portal/portal-source.js';
import { format as f } from '../../format.js';
import { noteWrapped, withSpinner } from '../../prompt.js';
import { reportInvalidServiceAddress, reportSourceProblem } from '../source.js';
import { reportServiceFailure } from './shared.js';

const enableCommand = (...flags: string[]) => [f.cmdAlt('apimatic', 'portal', 'copilot', 'enable'), ...flags].join(' ');

export class PortalCopilotEnablePrompts {
  public sourceProblem(problem: PortalSourceProblem, sourceDirectory: DirectoryPath) {
    reportSourceProblem(problem, sourceDirectory);
  }

  public invalidServiceAddress(errors: string[]) {
    reportInvalidServiceAddress(errors);
  }

  public registrationInvalid(problems: CopilotRegistrationProblem[], sourceDirectory: DirectoryPath) {
    const config = new FilePath(sourceDirectory, new FileName(APIMATIC_CONFIG_FILE_NAME));
    for (const problem of problems) {
      switch (problem.kind) {
        case 'invalidOrigin':
          log.error(
            `${f.var(problem.value)} is not a site's address. Pass each ${f.flag('origin')} as a scheme and a host ` +
              `alone, such as ${f.var('https://docs.example.com')}.`
          );
          break;
        case 'noOrigins':
          log.error(
            `Ask AI needs to know where the portal is deployed, as its key works only there. Set ` +
              `${f.var('portal.site.url')} in ${f.path(config)}, or pass the site with ${f.flag('origin')}. To try ` +
              `the chat on this machine first, run ${enableCommand(f.flag('dev'))}.`
          );
          break;
      }
    }
  }

  public keyNotReusable(problem: CopilotKeyProblem, wanted: CopilotKeyKind) {
    const rotate = enableCommand(...(wanted === 'dev' ? [f.flag('dev')] : []), f.flag('rotate'));
    switch (problem.kind) {
      case 'unrecognized':
        log.error(
          `The portal's ${f.var('portal.ai.copilot.key')} is not an Ask AI key the service accepts. ` +
            `Run ${rotate} to replace it with a new one.`
        );
        return;
      case 'otherKind':
        log.error(
          `The portal already has a ${describeKind(problem.current)} key. Run ${rotate} to replace it with a ` +
            `${describeKind(wanted)} one.`
        );
        return;
    }
  }

  public register(fn: Promise<Result<RegistrationOutcome, ServiceError>>) {
    return withSpinner('Registering the portal with Ask AI', 'Registered.', 'Registration failed.', fn);
  }

  public registrationFailed(error: ServiceError, service: ServiceAddress) {
    reportServiceFailure(error, service);
  }

  public keyNotSaved(problem: PortalScaffoldProblem, key: CopilotKey, sourceDirectory: DirectoryPath) {
    const config = new FilePath(sourceDirectory, new FileName(APIMATIC_CONFIG_FILE_NAME));
    const setting = `"ai": { "copilot": { "key": "${key.toString()}" } }`;
    log.error(
      `The portal is registered with Ask AI, but its key could not be saved to ${f.path(config)} ` +
        `(${describeUnsaved(problem)}). Set ${f.var(setting)} in its ${f.var('portal')} block by hand.`
    );
  }

  public revokePrevious(fn: Promise<Result<RevocationOutcome, ServiceError>>) {
    return withSpinner('Revoking the previous key', 'Revoked the previous key.', 'Revoking failed.', fn);
  }

  public previousKeyNotRevoked(error: ServiceError) {
    log.warn(
      `The previous key could not be revoked (${error.errorMessage}), so it still works where it is published. ` +
        `Run ${f.cmdAlt('apimatic', 'portal', 'copilot', 'disable')} later from a copy of the project that still ` +
        `holds it, or contact ${f.var('support@apimatic.io')}.`
    );
  }

  public enabled(outcome: RegistrationOutcome, key: CopilotKey, origins: readonly string[], rotated: boolean) {
    const sites = origins.length === 0 ? 'this machine' : origins.map((origin) => f.link(origin)).join(', ');
    log.success(`${describeEnabled(outcome, rotated)}: ${f.var(key.toString())}, which works on ${sites}.`);
    if (key.kind() === 'dev') {
      log.warn(
        `This is a development key: it works on this machine and the sites listed, and answers a limited number ` +
          `of questions a day. Run ${enableCommand(f.flag('rotate'))} for a key to deploy with.`
      );
    }
  }

  public nextSteps(kind: CopilotKeyKind) {
    const message =
      kind === 'dev'
        ? [
            `Preview the portal with its Ask AI chat: ${f.cmdAlt('apimatic', 'portal', 'serve')}.`,
            `Generate it with ${f.cmdAlt('apimatic', 'portal', 'generate')} once you have a key for its site.`
          ].join('\n')
        : [
            `1. Generate the portal: ${f.cmdAlt('apimatic', 'portal', 'generate')}.`,
            `2. Deploy it.`,
            `3. Give Ask AI its pages: ${f.cmdAlt('apimatic', 'portal', 'copilot', 'sync')}.`
          ].join('\n');
    noteWrapped(message, 'Next steps');
  }
}

function describeEnabled(outcome: RegistrationOutcome, rotated: boolean): string {
  if (rotated) {
    return 'Ask AI has a new key';
  }
  return outcome === 'created' ? 'Ask AI is set up' : "Ask AI's settings are up to date";
}

function describeUnsaved(problem: PortalScaffoldProblem): string {
  switch (problem.kind) {
    case 'sourceUnwritable':
      return problem.reason;
    case 'configUnreadable':
      return 'it could not be read';
    case 'configUnwritable':
      return 'it could not be written';
  }
}

function describeKind(kind: CopilotKeyKind): string {
  return kind === 'dev' ? 'development' : 'live';
}
