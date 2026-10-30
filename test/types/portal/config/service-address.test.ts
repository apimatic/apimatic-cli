import { expect } from 'chai';
import { ServiceAddress } from '../../../../src/types/portal/config/service-address';
import { withoutCopilotUrl } from '../../../helpers/copilot-url';

describe('ServiceAddress', () => {
  withoutCopilotUrl();

  const SETTING = 'APIMATIC_COPILOT_URL';

  const address = (value: unknown) => ServiceAddress.parse(value, SETTING)._unsafeUnwrap();
  const refusal = (value: unknown) => ServiceAddress.parse(value, SETTING)._unsafeUnwrapErr();

  const NOT_SECURE =
    "'APIMATIC_COPILOT_URL' must be the address of an Ask AI service, starting with 'https://', or of one on " +
    "this machine, such as 'http://localhost:8787'.";
  const NOT_ALONE =
    "'APIMATIC_COPILOT_URL' must be the service's address alone, written in full, without a path, query or " +
    "credentials, for example 'https://ask.apimatic.io'.";

  describe('parse', () => {
    it('reads a service over HTTPS, or one on this machine, as its origin', () => {
      const cases: [string, string][] = [
        ['https://ask.apimatic.io', 'https://ask.apimatic.io'],
        ['https://ask.apimatic.io/', 'https://ask.apimatic.io'],
        ['https://ask.staging.apimatic.io:8443', 'https://ask.staging.apimatic.io:8443'],
        ['HTTPS://ASK.APIMATIC.IO', 'https://ask.apimatic.io'],
        // A development deployment may sit on its host's own domain.
        ['https://ask-dev.example.azurecontainerapps.io', 'https://ask-dev.example.azurecontainerapps.io'],
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

    // The APIMatic login is sent there, so it never travels in the clear off this machine.
    it('refuses plain HTTP off this machine, and anything not a web address', () => {
      for (const value of [
        'http://ask.apimatic.io',
        'http://ask.example.com',
        'http://localhost:99999',
        'http://localhost:@evil.example/',
        'http://localhost.example.com',
        // `*.localhost` is resolved through DNS on some systems, so it may not be this machine.
        'http://ask.localhost',
        'javascript:alert(1)',
        '',
        7
      ]) {
        expect(refusal(value), String(value)).to.deep.equal([NOT_SECURE]);
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
        'https://ask.apimatic.io@evil.example',
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

  describe('current', () => {
    it("is APIMatic's own service unless APIMATIC_COPILOT_URL names another", () => {
      expect(ServiceAddress.current()._unsafeUnwrap().toString()).to.equal('https://ask.apimatic.io');
      process.env.APIMATIC_COPILOT_URL = '  ';
      expect(ServiceAddress.current()._unsafeUnwrap().toString()).to.equal('https://ask.apimatic.io');
      process.env.APIMATIC_COPILOT_URL = 'http://localhost:8787';
      expect(ServiceAddress.current()._unsafeUnwrap().toString()).to.equal('http://localhost:8787');
    });

    it('reports an address it cannot use, naming the variable', () => {
      process.env.APIMATIC_COPILOT_URL = 'http://ask.example.com';
      expect(ServiceAddress.current()._unsafeUnwrapErr()).to.deep.equal([NOT_SECURE]);
    });
  });
});
