import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { ServiceError } from '../../../../src/infrastructure/service-error.js';
import { PortalCopilotEnablePrompts } from '../../../../src/prompts/portal/copilot/enable.js';
import { DirectoryPath } from '../../../../src/types/file/directoryPath.js';
import { ServiceAddress } from '../../../../src/types/portal/config/service-address.js';
import { CopilotKey } from '../../../../src/types/portal/copilot/copilot-key.js';

describe('PortalCopilotEnablePrompts', () => {
  const SERVICE = ServiceAddress.parse('http://localhost:8787', 'APIMATIC_COPILOT_URL')._unsafeUnwrap();
  const SOURCE = new DirectoryPath('project', 'src');
  const prompts = new PortalCopilotEnablePrompts();
  let error: sinon.SinonStub;
  let warn: sinon.SinonStub;

  // Without its colours, which picocolors adds on Windows and in CI whatever the terminal.
  const plain = (stub: sinon.SinonStub) => stub.getCalls().map((call) => stripVTControlCharacters(String(call.args[0])));

  beforeEach(() => {
    error = sinon.stub(log, 'error');
    warn = sinon.stub(log, 'warn');
    sinon.stub(log, 'success');
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

  it('asks to sign in to set up Ask AI', () => {
    prompts.authorizationFailed({ kind: 'unauthenticated' });

    expect(plain(error)[0]).to.contain('You need to be signed in to set up Ask AI.');
  });

  it('names the service and the variable when the service cannot be reached', () => {
    prompts.registrationFailed(ServiceError.NetworkError, SERVICE);

    const [message] = plain(error);
    expect(message).to.contain('http://localhost:8787');
    expect(message).to.contain('APIMATIC_COPILOT_URL');
  });

  it("shows the service's own reason for refusing", () => {
    prompts.registrationFailed(ServiceError.badRequest('This key belongs to another account.', {}), SERVICE);

    expect(plain(error)).to.deep.equal(['This key belongs to another account.']);
  });

  it('points to --rotate for a key that cannot be kept', () => {
    prompts.keyNotReusable({ kind: 'otherKind', current: 'dev' }, 'live');
    prompts.keyNotReusable({ kind: 'unrecognized' }, 'dev');

    const [otherKind, unrecognized] = plain(error);
    expect(otherKind).to.contain('already has a development key');
    expect(otherKind).to.contain('--rotate');
    expect(otherKind).to.not.contain('--dev');
    expect(unrecognized).to.contain('--dev --rotate');
  });

  it('asks for a site when a live key would have none', () => {
    prompts.registrationInvalid([{ kind: 'noOrigins' }], SOURCE);

    const [message] = plain(error);
    expect(message).to.contain('portal.site.url');
    expect(message).to.contain('--origin');
    expect(message).to.contain('--dev');
  });

  it('gives the key to set by hand when it could not be saved', () => {
    const key = CopilotKey.generate('live');

    prompts.keyNotSaved({ kind: 'configUnwritable' }, key, SOURCE);

    expect(plain(error)[0]).to.contain(key.toString());
  });

  it('warns that a development key is limited', () => {
    prompts.enabled('created', CopilotKey.generate('dev'), [], false);
    prompts.enabled('created', CopilotKey.generate('live'), ['https://example.com'], false);

    expect(plain(warn)).to.have.length(1);
    expect(plain(warn)[0]).to.contain('development key');
  });
});
