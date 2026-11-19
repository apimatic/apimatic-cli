import { Command, Flags } from '@oclif/core';
import { DEFAULT_MOCK_PORT, DEFAULT_STUBS_DIRECTORY, MockServeAction } from '../../actions/mock/serve.js';
import { listenAt, LOCALHOST } from '../../infrastructure/mock/listen.js';
import { format, intro, outro } from '../../prompts/format.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FlagsProvider } from '../../types/flags-provider.js';
import { LIFETIME_FROM_STUB, lifetimeOfSeconds } from '../../types/mock/routing/token-lifetime.js';

const defaultPortText = String(DEFAULT_MOCK_PORT);

export default class MockServe extends Command {
  static readonly summary = 'Serve a mock of your API from stub files, for SDK tests to run against.';

  static readonly description = `Answers exactly the requests its stub files describe. A request no stub describes is answered 418 with the difference from the closest stub, so a failing test explains itself. An 'oauth2' stub adds an authorization server on the same origin.

A line holding 'MOCKSERVER_URL=<origin>' is printed once the mock listens; a test harness reads the origin from it. The requests the mock received are listed at '<origin>/__admin/requests', where DELETE clears them.

A busy port is an error, never replaced by another one. Use only the fixed test credentials of the stubs with the mock: it echoes what a request presented.`;

  static readonly cmdTxt = format.cmd('apimatic', 'mock', 'serve');

  static readonly examples = [
    MockServe.cmdTxt,
    `${MockServe.cmdTxt} ${format.flag('stubs', './stubs')} ${format.flag('port', '0')}`,
    `${MockServe.cmdTxt} ${format.flag('host', '0.0.0.0')} ${format.flag('port', defaultPortText)} ${format.flag(
      'token-ttl',
      '5'
    )} ${format.flag('verbose')}`
  ];

  static flags = {
    port: Flags.integer({
      char: 'p',
      description: 'port to serve the mock on; 0 picks a free port on localhost.',
      default: DEFAULT_MOCK_PORT,
      helpValue: defaultPortText,
      min: 0,
      max: 65535
    }),
    host: Flags.string({
      description: 'localhost or an IP address to listen on, which needs a port other than 0; 0.0.0.0 in a container.',
      default: LOCALHOST,
      parse: FlagsProvider.nonEmpty
    }),
    stubs: Flags.string({
      char: 's',
      description: `[default: ${DEFAULT_STUBS_DIRECTORY}] path to the directory containing the stub files.`,
      parse: FlagsProvider.nonEmpty
    }),
    'token-ttl': Flags.integer({
      description: "seconds the OAuth2 tokens live for, sent as expires_in; an oauth2 stub's own expiresIn by default.",
      min: 1
    }),
    verbose: Flags.boolean({
      description: 'log every request to stderr.',
      default: false
    })
  };

  public async run() {
    const {
      flags: { port, host, stubs, 'token-ttl': tokenTtl, verbose }
    } = await this.parse(MockServe);

    const listen = listenAt(host.trim(), port);
    if (listen.isErr()) {
      this.error(listen.error, { exit: 2 });
    }

    intro('Mock Serve');
    const result = await new MockServeAction().execute({
      stubs: DirectoryPath.fromUserInput(stubs ?? DEFAULT_STUBS_DIRECTORY),
      listen: listen.value,
      tokenLifetime: tokenTtl === undefined ? LIFETIME_FROM_STUB : lifetimeOfSeconds(tokenTtl),
      verbose
    });
    outro(result);
  }
}
