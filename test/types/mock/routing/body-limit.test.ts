import { expect } from 'chai';
import { declaredTooLong, MAX_BODY_BYTES, undeclaredTooLong } from '../../../../src/types/mock/routing/body-limit.js';

describe('the request body limit', () => {
  for (const declared of [undefined, '0', '1024', '30000000', '00030000000']) {
    it(`reads a body that declares ${declared ?? 'no length'}`, () => {
      const refusal = declaredTooLong(declared);

      expect(refusal).to.equal(undefined);
    });
  }

  const tooLong: [string, string][] = [
    ['30000001', '30,000,001'],
    ['00030000001', '30,000,001'],
    ['123456789012', '123,456,789,012'],
    ['18446744073709551615', '18,446,744,073,709,551,615']
  ];

  for (const [declared, shown] of tooLong) {
    it(`refuses a body that declares ${declared} bytes, naming both numbers`, () => {
      const refusal = declaredTooLong(declared);

      expect(refusal).to.equal(
        `The mock accepts a request body of at most 30,000,000 bytes; this one declares ${shown}.`
      );
    });
  }

  it('says of a body that declares no length that it is longer than the limit', () => {
    const refusal = undeclaredTooLong();

    expect(refusal).to.equal(
      'The mock accepts a request body of at most 30,000,000 bytes; this one declares no length and is longer.'
    );
  });

  it('is 30,000,000 bytes', () => {
    expect(MAX_BODY_BYTES).to.equal(30_000_000);
  });
});
