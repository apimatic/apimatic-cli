import { expect } from 'chai';
import { describeListen, fixedPlace, FREE_PORT, listenAt, originOf } from '../../../src/infrastructure/mock/listen.js';

describe('Listen', () => {
  const origins: [string, string][] = [
    ['localhost', 'http://localhost:4010'],
    ['127.0.0.1', 'http://127.0.0.1:4010'],
    ['::1', 'http://[::1]:4010'],
    ['[::1]', 'http://[::1]:4010']
  ];

  for (const [host, origin] of origins) {
    it(`writes the origin of ${host} as ${origin}, so a harness can read its port`, () => {
      const place = fixedPlace(host, 4010);

      const written = originOf(place);

      expect(written).to.equal(origin);
    });
  }

  for (const port of [0, -1, 65536, 4010.5]) {
    it(`refuses ${port} as a fixed port, naming it`, () => {
      const act = () => fixedPlace('localhost', port);

      expect(act).to.throw(RangeError, `A fixed port is 1 to 65535; ${port} is not.`);
    });
  }

  for (const port of [1, 65535]) {
    it(`keeps ${port} as a fixed port`, () => {
      const place = fixedPlace('localhost', port);

      expect(place).to.deep.equal({ kind: 'fixed', host: 'localhost', port });
    });
  }

  it('names a fixed place by its origin', () => {
    const named = describeListen(fixedPlace('::1', 4010));

    expect(named).to.equal('http://[::1]:4010');
  });

  it('names a free port as one, since no port was asked for', () => {
    const named = describeListen(FREE_PORT);

    expect(named).to.equal('a free port on localhost');
  });
});

describe('listenAt', () => {
  for (const host of ['localhost', 'LOCALHOST', 'Localhost']) {
    it(`reads ${host} with port 0 as a free port on localhost`, () => {
      const listen = listenAt(host, 0);

      expect(listen._unsafeUnwrap()).to.equal(FREE_PORT);
    });
  }

  it('reads localhost in any letter case with a port as that port of localhost', () => {
    const listen = listenAt('LocalHost', 4010);

    expect(listen._unsafeUnwrap()).to.deep.equal(fixedPlace('localhost', 4010));
  });

  const addresses: [string, string][] = [
    ['127.0.0.1', '127.0.0.1'],
    ['0.0.0.0', '0.0.0.0'],
    ['::1', '::1'],
    ['[::1]', '::1'],
    ['0:0:0:0:0:0:0:1', '::1'],
    ['2001:DB8::1', '2001:db8::1']
  ];

  for (const [host, canonical] of addresses) {
    it(`reads the IP address ${host} in its canonical spelling, ${canonical}`, () => {
      const listen = listenAt(host, 4010);

      expect(listen._unsafeUnwrap()).to.deep.equal(fixedPlace(canonical, 4010));
    });
  }

  for (const host of ['my-machine', 'a/b', '[::1]:80', '127.1', '', ' ', '256.0.0.1']) {
    it(`refuses the host '${host}', which is neither localhost nor an IP address`, () => {
      const listen = listenAt(host, 4010);

      expect(listen._unsafeUnwrapErr()).to.equal(`'${host}' is neither localhost nor an IP address.`);
    });
  }

  for (const [host, shown] of [
    ['0.0.0.0', '0.0.0.0'],
    ['[::1]', '::1']
  ]) {
    it(`refuses port 0 on ${host}, since a free port is found on localhost alone`, () => {
      const listen = listenAt(host, 0);

      expect(listen._unsafeUnwrapErr()).to.equal(
        `The host ${shown} needs a port other than 0: a free port is found on localhost alone.`
      );
    });
  }
});
