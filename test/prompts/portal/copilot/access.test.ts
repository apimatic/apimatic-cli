import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { AskAiAccessPrompts } from '../../../../src/prompts/portal/copilot/access.js';

describe('AskAiAccessPrompts', () => {
  const prompts = new AskAiAccessPrompts('set up Ask AI');
  let error: sinon.SinonStub;

  // Without its colours, which picocolors adds on Windows and in CI whatever the terminal.
  const plain = (stub: sinon.SinonStub) =>
    stub.getCalls().map((call) => stripVTControlCharacters(String(call.args[0])));

  beforeEach(() => {
    error = sinon.stub(log, 'error');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('names the plan, not the build, when the subscription does not include Ask AI', () => {
    prompts.authorizationFailed({ kind: 'notEntitled', feature: 'askAi' });

    const [message] = plain(error);
    expect(message).to.contain('Your subscription does not include Ask AI.');
    expect(message).to.contain('https://www.apimatic.io/pricing');
  });

  it('asks to sign in to do what the command does, the same with no login as with one refused', () => {
    prompts.notLoggedIn();
    prompts.authorizationFailed({ kind: 'unauthenticated' });

    const [missing, refused] = plain(error);
    expect(missing).to.contain('You need to be signed in to set up Ask AI.');
    expect(refused).to.equal(missing);
  });
});
