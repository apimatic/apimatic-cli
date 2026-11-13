import os from 'os';
import sinon from 'sinon';
import { Config } from '@oclif/core';
import { err, ok } from 'neverthrow';
import { PortalAuthorizationService } from '../../../src/infrastructure/services/portal-authorization-service.js';
import { PortalSourceContext } from '../../../src/types/portal-source-context.js';
import { stubPreparePortalProject } from '../../actions/portal/prepare-project-stubs.js';

const FIXTURE = 'test/resources/portal-inputs/default';

/** Just enough of oclif's config for a command to parse its flags and name its config directory. */
const config = {
  configDir: os.tmpdir(),
  shell: 'test',
  runHook: async () => ({ successes: [], failures: [] })
} as unknown as Config;

/** Runs a portal command up to its read of the source, and gives what its flags asked that read for. */
export async function buildOptionsOf(
  command: new (argv: string[], config: Config) => { run(): Promise<unknown> },
  argv: string[]
): Promise<unknown> {
  stubPreparePortalProject();
  sinon.stub(PortalAuthorizationService.prototype, 'authorize').resolves(ok(undefined));
  const resolve = sinon.stub(PortalSourceContext.prototype, 'resolve').resolves(err({ kind: 'missingConfig' }));
  sinon.stub(process.stdout, 'write').returns(true);
  const exitCode = process.exitCode;
  try {
    await new command([...argv, '--input', FIXTURE], config).run();
  } finally {
    process.exitCode = exitCode;
    sinon.restore();
  }
  return resolve.firstCall.args[0];
}
