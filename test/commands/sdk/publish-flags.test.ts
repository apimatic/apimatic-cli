import { expect } from 'chai';
import { Parser } from '@oclif/core';
import SdkPublish from '../../../src/commands/sdk/publish.js';
import { CodeGenerationVersion, Stability } from '../../../src/types/sdk/generate.js';

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

// Recording a publish is bookkeeping, not a decision, so the flag that asked is gone. A run that
// still passes it is told it is unknown rather than having it quietly ignored — this pins that it
// is really gone, not merely undocumented.
describe('sdk publish flags', () => {
  it('no longer accepts --update-plugin-config', async () => {
    expect((await rejects(['--update-plugin-config'])).message).to.contain('update-plugin-config');
  });

  // v3 is retired, so v4 is the only value — but the flag stays, because the next generator should
  // be something a caller asks for rather than something a release changes underneath them.
  it('accepts the one code generator version there is', async () => {
    const { flags } = (await parse(['--codegen-version', 'v4'])) as never as {
      flags: Record<string, unknown>;
    };

    expect(flags['codegen-version']).to.equal(CodeGenerationVersion.V4);
  });

  it('defaults to that version when the flag is not passed', async () => {
    const { flags } = (await parse([])) as never as { flags: Record<string, unknown> };

    expect(flags['codegen-version']).to.equal(CodeGenerationVersion.V4);
  });

  it('refuses the retired version rather than generating something else', async () => {
    expect((await rejects(['--codegen-version', 'v3'])).message).to.contain('v3');
  });

  it('still chooses a stability level, which outlived the generator version', async () => {
    const { flags, metadata } = (await parse(['--stability', 'beta'])) as never as {
      flags: Record<string, unknown>;
      metadata: { flags: Record<string, { setFromDefault?: boolean } | undefined> };
    };

    expect(flags.stability).to.equal(Stability.BETA);
    expect(metadata.flags.stability?.setFromDefault).to.not.equal(true);
  });

  // What a language offers is per language, so the flag carries no default of its own: absent
  // means unchosen, and the run resolves it against that language's own levels.
  it('leaves stability unset when it was not asked for', async () => {
    const { flags } = (await parse([])) as never as { flags: Record<string, unknown> };

    expect(flags.stability).to.be.undefined;
  });

  it('keeps a stability the caller did ask for', async () => {
    const { flags } = (await parse(['--stability', 'beta'])) as never as { flags: Record<string, unknown> };

    expect(flags.stability).to.equal(Stability.BETA);
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
