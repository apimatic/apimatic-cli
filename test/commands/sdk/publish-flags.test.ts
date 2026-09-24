import { expect } from 'chai';
import { Parser } from '@oclif/core';
import SdkPublish from '../../../src/commands/sdk/publish.js';

const parse = (argv: string[]) => Parser.parse(argv, { flags: SdkPublish.flags as never, strict: true } as never);

const rejects = async (argv: string[]): Promise<Error> => {
  let thrown: unknown;
  try {
    await parse(argv);
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `expected ${argv.join(' ')} to be rejected`).to.be.an('error');
  return thrown as Error;
};

// v3 generation is retired, so the two flags that chose between generators are gone, and with them
// the flag that asked whether a publish should record itself. A run that still passes one is told
// it is unknown rather than having it quietly ignored — these pin that they are really gone, not
// merely undocumented.
describe('sdk publish retired flags', () => {
  it('no longer accepts a code generator version', async () => {
    expect((await rejects(['--codegen-version', 'v4'])).message).to.contain('codegen-version');
  });

  it('no longer accepts a stability level', async () => {
    expect((await rejects(['--stability', 'beta'])).message).to.contain('stability');
  });

  // Recording a publish is bookkeeping, not a decision: it always happens now.
  it('no longer accepts --update-plugin-config', async () => {
    expect((await rejects(['--update-plugin-config'])).message).to.contain('update-plugin-config');
  });

  it('still parses the flags a publish is actually made of', async () => {
    const { flags } = (await parse([
      '--profile-id',
      'a1b2c3d4e5f6a1b2c3d4e5f6',
      '--language',
      'typescript',
      '--version',
      '1.0.0',
      '--publish-type',
      'package'
    ])) as never as { flags: Record<string, unknown> };

    expect(flags.language).to.equal('typescript');
    expect(flags.version).to.equal('1.0.0');
  });
});
