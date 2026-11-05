import { expect } from 'chai';
import sinon from 'sinon';
import hook from '../../src/hooks/not-found.js';
import utils from '../../src/hooks/utils.js';
import { terminal } from '../../src/infrastructure/terminal.js';

describe('command not found hook', () => {
  let runCommand: sinon.SinonStub;

  /** Runs the hook for a typed `id` against a CLI with one command under the sdk topic, the suggestion confirmed. */
  const typed = async (id: string, argv: string[] = []) => {
    sinon.stub(terminal, 'isInteractive').returns(true);
    sinon.stub(utils, 'getConfirmation').resolves(true);
    runCommand = sinon.stub().resolves();
    const config = {
      bin: 'apimatic',
      topicSeparator: ' ',
      commands: [{ id: 'sdk:generate', hidden: false, aliases: [] }],
      commandIDs: ['sdk:generate', 'help'],
      findTopic: (name: string) => (name === 'sdk' ? { name } : undefined),
      runCommand
    };
    await hook.call({ config, warn: sinon.stub(), error: sinon.stub() } as any, { id, argv, config } as any);
  };

  afterEach(() => {
    sinon.restore();
  });

  it('runs the help command for the topic when help was asked for after it', async () => {
    await typed('sdk:help');

    expect(runCommand.calledOnceWithExactly('help', ['sdk'])).to.be.true;
  });

  it('runs the closest command with the arguments as typed', async () => {
    await typed('sdk:generat', ['--language', 'python']);

    expect(runCommand.calledOnceWithExactly('sdk:generate', ['--language', 'python'])).to.be.true;
  });
});
