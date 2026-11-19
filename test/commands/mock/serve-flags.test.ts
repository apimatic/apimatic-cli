import { expect } from 'chai';
import MockServe from '../../../src/commands/mock/serve.js';
import { flagParser } from '../flag-parser.js';

const { parse, rejects } = flagParser(MockServe);

const flagsOf = async (argv: string[]) => ((await parse(argv)) as never as { flags: Record<string, unknown> }).flags;

describe('mock serve flags', () => {
  it('defaults to port 4010 of localhost, the stubs of the working directory and each stub its own token lifetime', async () => {
    const flags = await flagsOf([]);

    expect(flags).to.deep.equal({ port: 4010, host: 'localhost', verbose: false });
  });

  it('reads every flag, in any order', async () => {
    const flags = await flagsOf([
      '--verbose',
      '--token-ttl',
      '5',
      '--host',
      '0.0.0.0',
      '--stubs',
      './my-stubs',
      '--port',
      '4010'
    ]);

    expect(flags).to.deep.equal({
      port: 4010,
      host: '0.0.0.0',
      stubs: './my-stubs',
      'token-ttl': 5,
      verbose: true
    });
  });

  for (const port of ['0', '1', '65535']) {
    it(`accepts ${port} as a port`, async () => {
      const flags = await flagsOf(['--port', port]);

      expect(flags.port).to.equal(Number(port));
    });
  }

  it('reads the short forms of port and stubs', async () => {
    const flags = await flagsOf(['-p', '0', '-s', 'stubs']);

    expect([flags.port, flags.stubs]).to.deep.equal([0, 'stubs']);
  });

  const refused: [string, string[], string][] = [
    ['a port that is no number', ['--port', 'abc'], 'port'],
    ['a port without a value', ['--port'], 'port'],
    ['a port above 65535', ['--port', '70000'], 'port'],
    ['a negative port', ['--port', '-1'], 'port'],
    ['a port written with a sign', ['--port', '+4010'], 'port'],
    ['a stubs flag without a value', ['--stubs'], 'stubs'],
    ['an empty stubs directory', ['--stubs', ''], 'stubs'],
    ['a blank stubs directory', ['--stubs', ' '], 'stubs'],
    ['an empty host', ['--host', ''], 'host'],
    ['a blank host', ['--host', ' '], 'host'],
    ['a token lifetime that is no number', ['--token-ttl', 'soon'], 'token-ttl'],
    ['a token lifetime of 0', ['--token-ttl', '0'], 'token-ttl'],
    ['a negative token lifetime', ['--token-ttl', '-5'], 'token-ttl'],
    ['a token lifetime written with a sign', ['--token-ttl', '+7'], 'token-ttl'],
    ['an option it does not have', ['--bogus'], 'bogus'],
    ['an option it does not have after valid ones', ['--port', '4010', '--verbose', '--bogus'], 'bogus'],
    ['an argument that is no flag', ['4010'], '4010']
  ];

  for (const [what, argv, named] of refused) {
    it(`refuses ${what}, naming it`, async () => {
      const error = await rejects(argv);

      expect(error.message).to.contain(named);
    });
  }
});
