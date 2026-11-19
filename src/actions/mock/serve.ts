import { Listen } from '../../infrastructure/mock/listen.js';
import { MockHost } from '../../infrastructure/mock/mock-host.js';
import { MockServePrompts } from '../../prompts/mock/serve.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { TokenLifetime } from '../../types/mock/routing/token-lifetime.js';
import { ActionResult } from '../action-result.js';

export const DEFAULT_MOCK_PORT = 4010;
export const DEFAULT_STUBS_DIRECTORY = './stubs';

export interface MockServeOptions {
  readonly stubs: DirectoryPath;
  readonly listen: Listen;
  readonly tokenLifetime: TokenLifetime;
  readonly verbose: boolean;
}

export class MockServeAction {
  private readonly prompts: MockServePrompts = new MockServePrompts();

  public readonly execute = async (options: MockServeOptions): Promise<ActionResult> => {
    const { stubs, listen, tokenLifetime, verbose } = options;
    const onRequest = verbose ? this.prompts.requestServed : undefined;
    const started = await MockHost.start({ stubs, listen, tokenLifetime, onRequest });

    switch (started.kind) {
      case 'stubProblems':
        this.prompts.stubProblems(started.problems, stubs);
        return ActionResult.failed();
      case 'notListening':
        this.prompts.notListening(started.where, started.reason);
        return ActionResult.failed();
      case 'running': {
        const { host } = started;
        // Before the origin is printed: a harness may stop the mock the moment it reads that line.
        const interrupted = this.prompts.blockExecution();
        this.prompts.mockServed(host.url, stubs, host.stubs.all.length);
        await interrupted;
        this.prompts.stopping();
        await host.stop();
        return ActionResult.stopped();
      }
    }
  };
}
