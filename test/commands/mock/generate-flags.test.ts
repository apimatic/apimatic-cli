import { expect } from 'chai';
import { DEFAULT_STUBS_DIRECTORY } from '../../../src/actions/mock/serve.js';
import MockGenerate from '../../../src/commands/mock/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { ProjectContext } from '../../../src/types/project-context.js';
import { flagParser } from '../flag-parser.js';

const { parse, rejects } = flagParser(MockGenerate);

const flagsOf = async (argv: string[]) => ((await parse(argv)) as never as { flags: Record<string, unknown> }).flags;

describe('mock generate flags', () => {
  it('needs no flag: the project of the working directory, its stubs directory, and a question before it overwrites', async () => {
    const flags = await flagsOf([]);

    expect(flags).to.deep.equal({ force: false });
  });

  it('writes by default to the stubs directory mock serve reads by default', () => {
    const written = ProjectContext.at(undefined).stubsDirectory(undefined);

    expect(written.isEqual(DirectoryPath.fromUserInput(DEFAULT_STUBS_DIRECTORY))).to.be.true;
  });

  it('reads every flag, in any order', async () => {
    const flags = await flagsOf(['--force', '--auth-key', 'key', '--destination', './my-stubs', '--input', './api']);

    expect(flags).to.deep.equal({ input: './api', destination: './my-stubs', force: true, 'auth-key': 'key' });
  });

  it('reads the short forms plugin generate has', async () => {
    const flags = await flagsOf(['-i', './api', '-d', './my-stubs', '-f', '-k', 'key']);

    expect(flags).to.deep.equal({ input: './api', destination: './my-stubs', force: true, 'auth-key': 'key' });
  });

  const refused: [string, string[], string][] = [
    ['a language, which the stub files do not depend on', ['--language', 'csharp'], 'language'],
    ['a destination without a value', ['--destination'], 'destination'],
    ['an option it does not have', ['--bogus'], 'bogus'],
    ['an argument that is no flag', ['stubs'], 'stubs']
  ];

  for (const [what, argv, named] of refused) {
    it(`refuses ${what}, naming it`, async () => {
      const error = await rejects(argv);

      expect(error.message).to.contain(named);
    });
  }

  it('is hidden until the endpoint it calls is live', () => {
    expect(MockGenerate.hidden).to.equal(true);
  });
});
