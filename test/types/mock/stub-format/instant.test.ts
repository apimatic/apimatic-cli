import { expect } from 'chai';
import { Instant } from '../../../../src/types/mock/stub-format/instant.js';

const written = (text: string): string | undefined => Instant.parse(text)?.toString();

describe('Instant', () => {
  for (const spelling of [
    '2025-12-09T14:30:00Z',
    '2025-12-09T14:30:00.000Z',
    '2025-12-09T14:30:00+00:00',
    '2025-12-09T15:30:00+01:00',
    '2025-12-09T09:30:00-05:00',
    '2025-12-09T15:30:00.000+01:00',
    '2025-12-09T14:30:00-00:00',
    '2025-12-09t14:30:00z',
    '2025-12-09T14:30:00.0000000Z',
    '2025-12-10T04:30:00+14:00',
    'Tue, 09 Dec 2025 14:30:00 GMT',
    'tue, 09 dec 2025 14:30:00 gmt',
    '1765290600',
    '  2025-12-09T14:30:00Z  '
  ]) {
    it(`reads '${spelling}' as the instant every other spelling of it names`, () => {
      const reference = Instant.parse('2025-12-09T14:30:00Z');

      const parsed = Instant.parse(spelling);

      expect(parsed).to.deep.equal(reference);
    });
  }

  it('keeps the first seven digits of a longer fraction', () => {
    const text = '2025-12-09T14:30:00.123456789Z';

    const parsed = Instant.parse(text);

    expect(parsed).to.deep.equal(Instant.parse('2025-12-09T14:30:00.1234567Z'));
  });

  for (const [seconds, canonical] of [
    ['0', '1970-01-01T00:00:00Z'],
    ['-1', '1969-12-31T23:59:59Z'],
    ['951782400', '2000-02-29T00:00:00Z'],
    ['-62135596800', '0001-01-01T00:00:00Z'],
    ['253402300799', '9999-12-31T23:59:59Z']
  ]) {
    it(`reads ${seconds} Unix seconds as ${canonical}`, () => {
      const parsed = Instant.parse(seconds);

      expect(parsed).to.deep.equal(Instant.parse(canonical));
    });
  }

  for (const text of [
    '',
    '2025-12-09',
    '2025-12-09T14:30:00',
    '14:30:00Z',
    '2025-13-09T14:30:00Z',
    '2025-02-29T14:30:00Z',
    '2025-12-09T24:00:00Z',
    '2025-12-09T14:30:60Z',
    '0000-01-01T00:00:00Z',
    '02025-12-09T14:30:00Z',
    '2025-12-09 14:30:00Z',
    '2025-12-09T14:30:00 Z',
    'Tue, 09 Dec 2025 14:30:00',
    'Mon, 09 Dec 2025 14:30:00 GMT',
    'Tue, 9 Dec 2025 14:30:00 GMT',
    'Tue, 09 Dec 2025 14:30:00  GMT',
    '99999999999999999999',
    '1765290600000',
    '-62135596801',
    '0001-01-01T00:00:00+01:00',
    '9999-12-31T23:59:59-01:00',
    '-',
    '--1',
    '+1765290600',
    'soon',
    '2025-12-09T15:30:00+0100',
    '2025-12-09T14:30:00-0000',
    '2025-12-09T15:30:00+1:00',
    '2025-12-09T14:30:00+14:01',
    '2025-12-09T14:30:00+13:60',
    '2025-12-09T14:30:00.Z',
    '2025-12-09T14:30:00.+00:00'
  ]) {
    it(`reads no instant in '${text}'`, () => {
      const parsed = Instant.parse(text);

      expect(parsed).to.be.undefined;
    });
  }

  for (const [text, canonical] of [
    ['2025-12-09T15:30:00+01:00', '2025-12-09T14:30:00Z'],
    ['2025-12-09T14:30:00.000Z', '2025-12-09T14:30:00Z'],
    ['2025-12-09T14:30:00.5Z', '2025-12-09T14:30:00.5Z'],
    ['2025-12-09T14:30:00.0000001Z', '2025-12-09T14:30:00.0000001Z'],
    ['2025-12-31T23:30:00-01:00', '2026-01-01T00:30:00Z'],
    ['Sat, 29 Feb 2020 23:59:59 GMT', '2020-02-29T23:59:59Z'],
    ['1765290600', '2025-12-09T14:30:00Z'],
    ['-62135596800', '0001-01-01T00:00:00Z']
  ]) {
    it(`writes '${text}' as ${canonical}: UTC, with the fraction only when there is one`, () => {
      const spelled = written(text);

      expect(spelled).to.equal(canonical);
    });
  }

  it('tells a second apart from the next, and a fraction from none', () => {
    const instant = Instant.parse('2025-12-09T14:30:00Z');

    const equal = ['2025-12-09T14:30:01Z', '2025-12-09T14:30:00.1Z', '2025-12-09T15:30:00+01:00'].map((other) =>
      Instant.parse(other)?.isEqual(instant as Instant)
    );

    expect(equal).to.deep.equal([false, false, true]);
  });

  it('names the spellings it reads when a text is none of them', () => {
    const message = Instant.notADateTime('soon');

    expect(message).to.equal(
      "'soon' is not a date-time; write RFC 3339 (2025-12-09T14:30:00Z or with an offset), RFC 1123 or Unix seconds."
    );
  });
});
