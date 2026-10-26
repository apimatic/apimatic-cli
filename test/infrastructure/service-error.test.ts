import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import { ServiceError, ServiceErrorCode } from '../../src/infrastructure/service-error.js';

describe('ServiceError.unauthorizedWithHint', () => {
  const messageFor = (apiMessage: string | null): string =>
    stripVTControlCharacters(ServiceError.unauthorizedWithHint(apiMessage).errorMessage);

  it('is an unauthorized error', () => {
    expect(ServiceError.unauthorizedWithHint(null).code).to.equal(ServiceErrorCode.UnAuthorized);
  });

  it("leads with the API's own message when there is one", () => {
    expect(messageFor('Your auth key has expired.')).to.match(/^Your auth key has expired\. /);
  });

  it('falls back to a generic reason when the API gives none', () => {
    expect(messageFor(null)).to.match(/^Authorization has been denied for this request\. /);
  });

  // Every 401 from every command prints this, so it has to read as a whole sentence.
  it('names both ways to log in, and ends the sentence', () => {
    expect(messageFor(null)).to.contain(
      'Please run apimatic auth login to log in via browser, ' +
        'or apimatic auth login --auth-key={api-key} to log in with an auth key.'
    );
  });
});
