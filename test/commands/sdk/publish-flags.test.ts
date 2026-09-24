import { expect } from 'chai';
import { Parser } from '@oclif/core';
import SdkPublish from '../../../src/commands/sdk/publish.js';
import { Stability } from '../../../src/types/sdk/generate.js';

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

// v3 generation is retired, so the flag that chose between generators is gone, and with it the
// flag that asked whether a publish should record itself. A run that still passes one is told it
// is unknown rather than having it quietly ignored — these pin that they are really gone, not
// merely undocumented. `--stability` is not among them: v4 renders each language at beta first and
// stable later, so the level outlives the version.
describe('sdk publish retired flags', () => {
  it('no longer accepts a code generator version', async () => {
    expect((await rejects(['--codegen-version', 'v4'])).message).to.contain('codegen-version');
  });

  // Recording a publish is bookkeeping, not a decision: it always happens now.
  it('no longer accepts --update-plugin-config', async () => {
    expect((await rejects(['--update-plugin-config'])).message).to.contain('update-plugin-config');
  });

  it('still chooses a stability level, which outlived the generator version', async () => {
    const { flags, metadata } = (await parse(['--stability', 'beta'])) as never as {
      flags: Record<string, unknown>;
      metadata: { flags: Record<string, { setFromDefault?: boolean } | undefined> };
    };

    expect(flags.stability).to.equal(Stability.BETA);
    expect(metadata.flags.stability?.setFromDefault).to.not.equal(true);
  });

  // The summary names the level only when the user picked it, which is read from oclif's parse
  // metadata rather than the value — `--stability stable` and the default are the same string.
  it('reports a stability level that only came from the default', async () => {
    const { flags, metadata } = (await parse([])) as never as {
      flags: Record<string, unknown>;
      metadata: { flags: Record<string, { setFromDefault?: boolean } | undefined> };
    };

    expect(flags.stability).to.equal(Stability.STABLE);
    expect(metadata.flags.stability?.setFromDefault).to.equal(true);
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
