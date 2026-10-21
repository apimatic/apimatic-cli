import { expect } from 'chai';
import { ServiceAddress } from '../../../../src/types/portal/config/service-address';

describe('ServiceAddress', () => {
  const SETTING = 'portal.ai.copilot.apiUrl';

  const address = (value: unknown) => ServiceAddress.parse(value, SETTING)._unsafeUnwrap();
  const refusal = (value: unknown) => ServiceAddress.parse(value, SETTING)._unsafeUnwrapErr();

  const NOT_APIMATIC =
    "'portal.ai.copilot.apiUrl' must be the address of APIMatic's Ask AI service, starting with 'https://' and " +
    "ending in 'apimatic.io', or of one on this machine, such as 'http://localhost:8787'.";
  const NOT_ALONE =
    "'portal.ai.copilot.apiUrl' must be the service's address alone, written in full, without a path, query or " +
    "credentials, for example 'https://ask.apimatic.io'.";

  describe('parse', () => {
    it("reads APIMatic's own service, over HTTPS, or one on this machine, as its origin", () => {
      const cases: [string, string][] = [
        ['https://ask.apimatic.io', 'https://ask.apimatic.io'],
        ['https://ask.apimatic.io/', 'https://ask.apimatic.io'],
        ['https://apimatic.io', 'https://apimatic.io'],
        ['https://ask.staging.apimatic.io:8443', 'https://ask.staging.apimatic.io:8443'],
        ['HTTPS://ASK.APIMATIC.IO', 'https://ask.apimatic.io'],
        ['http://localhost:8787', 'http://localhost:8787'],
        ['https://localhost:8787/', 'https://localhost:8787'],
        ['http://127.0.0.1:8787', 'http://127.0.0.1:8787'],
        ['http://[::1]:8787', 'http://[::1]:8787'],
        ['https://ask.apimatic.io:443', 'https://ask.apimatic.io'],
        ['http://localhost:80/', 'http://localhost']
      ];
      for (const [value, origin] of cases) {
        expect(address(value).toString(), value).to.equal(origin);
      }
    });

    // `sync` sends the APIMatic login there, so no service but APIMatic's, or one on this machine, is accepted.
    it('refuses any other service, or APIMatic over plain HTTP', () => {
      for (const value of [
        'https://ask.example.com',
        'http://ask.apimatic.io',
        'https://ask.apimatic.io.example.com',
        'https://evilapimatic.io',
        'https://.apimatic.io',
        'https://ask..apimatic.io',
        'http://localhost:99999',
        'https://ask.apimatic.io@evil.example',
        'http://localhost:@evil.example/',
        'http://localhost.example.com',
        // `*.localhost` is resolved through DNS on some systems, so it may not be this machine.
        'http://ask.localhost',
        'javascript:alert(1)',
        '',
        7
      ]) {
        expect(refusal(value), String(value)).to.deep.equal([NOT_APIMATIC]);
      }
    });

    // The CLI and the chat add the service's own paths, so a path of the address's own would be dropped or doubled.
    it('refuses an address with a path, a query, a fragment or credentials', () => {
      for (const value of [
        'https://ask.apimatic.io/v1',
        'https://ask.apimatic.io\\v1',
        'https://ask.apimatic.io/?',
        'https://ask.apimatic.io/?region=eu',
        'https://ask.apimatic.io#',
        'https://user@ask.apimatic.io',
        'https://user:secret@ask.apimatic.io',
        'http://localhost:8787/api',
        // Addresses the URL parser would rewrite: refused, so what is accepted is what was written.
        'http://127.1:8787',
        'http://[0:0::1]:8787',
        'https://ask%2eapimatic.io',
        'https://ask.apimatic.io:',
        'http://localhost:08787'
      ]) {
        expect(refusal(value), value).to.deep.equal([NOT_ALONE]);
      }
    });
  });
});
