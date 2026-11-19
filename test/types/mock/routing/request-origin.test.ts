import { expect } from 'chai';
import { requestOrigin, unreadableHost } from '../../../../src/types/mock/routing/request-origin.js';

describe('requestOrigin', () => {
  const readable: [string, string][] = [
    ['localhost:4010', 'http://localhost:4010'],
    ['mock.example:9000', 'http://mock.example:9000'],
    ['mock.example', 'http://mock.example'],
    ['mock.example:80', 'http://mock.example'],
    ['mock.example:0080', 'http://mock.example'],
    ['MOCK.Example:8080', 'http://mock.example:8080'],
    ['127.0.0.1:65535', 'http://127.0.0.1:65535'],
    ['my_service-1:8080', 'http://my_service-1:8080'],
    ['[::1]:4010', 'http://[::1]:4010'],
    ['[::1]', 'http://[::1]'],
    ['[2001:DB8::1]:80', 'http://[2001:db8::1]']
  ];

  for (const [host, origin] of readable) {
    it(`reads the Host '${host}' as ${origin}`, () => {
      const read = requestOrigin([host]);

      expect(read).to.equal(origin);
    });
  }

  const unreadable: [string, string[]][] = [
    ['no Host header', []],
    ['an empty Host', ['']],
    ['two Host headers', ['a', 'b']],
    ['a port above 65535', ['localhost:99999']],
    ['a port of six digits', ['localhost:004010']],
    ['a port without digits', ['localhost:']],
    ['a port that is no number', ['localhost:http']],
    ['a port without a host', [':4010']],
    ['an IPv6 literal without brackets', ['::1']],
    ['an IPv6 literal left open', ['[::1']],
    ['empty brackets', ['[]:4010']],
    ['a space in the host', ['local host']],
    ['credentials before the host', ['user@host']],
    ['a path after the host', ['host/path']]
  ];

  for (const [what, hosts] of unreadable) {
    it(`reads no origin from ${what}`, () => {
      const read = requestOrigin(hosts);

      expect(read).to.equal(undefined);
    });
  }

  it('quotes every Host value sent when it says why the request is refused', () => {
    const reason = unreadableHost(['a', 'b']);

    expect(reason).to.equal(
      "The request's Host header ('a, b') names no host and port the mock can read its URL from."
    );
  });
});
