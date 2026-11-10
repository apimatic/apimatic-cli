import { expect } from 'chai';
import { describeListen, fixedPlace, FREE_PORT, originOf } from '../../../src/infrastructure/mock/listen.js';

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
