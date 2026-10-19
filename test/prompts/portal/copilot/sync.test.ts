import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { ServiceError } from '../../../../src/infrastructure/service-error.js';
import { PortalCopilotSyncPrompts } from '../../../../src/prompts/portal/copilot/sync.js';

describe('PortalCopilotSyncPrompts', () => {
  const API_URL = 'https://ask.example.com';
  const prompts = new PortalCopilotSyncPrompts();
  let error: sinon.SinonStub;

  // Without its colours, which picocolors adds on Windows and in CI whatever the terminal.
  const printed = () => error.getCalls().map((call) => stripVTControlCharacters(String(call.args[0])));

  beforeEach(() => {
    error = sinon.stub(log, 'error');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('tells a timed-out upload to sync again, rather than to check the address', () => {
    prompts.uploadFailed(ServiceError.timeout('The upload did not finish within 2 minutes.'), API_URL);

    const [message] = printed();
    expect(message).to.contain('The upload did not finish within 2 minutes.');
    expect(message).to.contain('sync again');
    expect(message).to.not.contain('could not be reached');
    expect(message).to.not.contain('keeps indexing');
  });

  it('tells timed-out indexing that the service keeps indexing', () => {
    prompts.indexingFailed(ServiceError.timeout('Indexing did not finish within 10 minutes.'), API_URL);

    const [message] = printed();
    expect(message).to.contain('Indexing did not finish within 10 minutes.');
    expect(message).to.contain('keeps indexing');
  });

  it("words failed indexing itself, with the service's reason when it gives one", () => {
    prompts.indexingFailed(ServiceError.processingFailed('Embedding provider unavailable.'), API_URL);
    prompts.indexingFailed(ServiceError.processingFailed(null), API_URL);

    expect(printed()).to.deep.equal([
      'The Ask AI service could not index the pages: Embedding provider unavailable. ' +
        'Ask AI answers from the previous pages until a sync is indexed.',
      'The Ask AI service could not index the pages. Ask AI answers from the previous pages until a sync is indexed.'
    ]);
  });

  it('tells either step that a service it could not reach may be at the wrong address', () => {
    prompts.uploadFailed(ServiceError.NetworkError, API_URL);
    prompts.indexingFailed(ServiceError.NetworkError, API_URL);

    for (const message of printed()) {
      expect(message).to.contain(`The Ask AI service at ${API_URL} could not be reached`);
    }
  });
});
