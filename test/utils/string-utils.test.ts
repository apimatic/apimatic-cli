import { expect } from 'chai';
import { toKebabCase, toTitleCase } from '../../src/utils/string-utils';

// `toKebabCase` seeds the default plugin id from a project folder name, and the prompt then
// validates that id against /^[a-z0-9]+(-[a-z0-9]+)*$/. Anything this function can emit for a
// plausible folder name therefore has to satisfy that pattern, which is what most of these pin.
const PLUGIN_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('toKebabCase', () => {
  it('leaves an already kebab-case name alone', () => {
    expect(toKebabCase('acme-payments')).to.equal('acme-payments');
  });

  it('splits camelCase on the case boundary', () => {
    expect(toKebabCase('acmePayments')).to.equal('acme-payments');
  });

  it('splits PascalCase on the case boundary', () => {
    expect(toKebabCase('AcmePayments')).to.equal('acme-payments');
  });

  it('keeps an acronym whole when a word follows it', () => {
    expect(toKebabCase('APIMatic')).to.equal('api-matic');
  });

  it('keeps a trailing acronym whole', () => {
    expect(toKebabCase('acmeAPI')).to.equal('acme-api');
  });

  it('treats spaces, underscores and dots as separators', () => {
    expect(toKebabCase('Acme Payments_sdk.core')).to.equal('acme-payments-sdk-core');
  });

  it('collapses a run of separators into a single dash', () => {
    expect(toKebabCase('acme___payments   sdk')).to.equal('acme-payments-sdk');
  });

  it('drops leading and trailing separators instead of emitting stray dashes', () => {
    expect(toKebabCase('--acme-payments--')).to.equal('acme-payments');
    expect(toKebabCase('  acme payments  ')).to.equal('acme-payments');
  });

  it('keeps digits attached to the lower-case word they trail', () => {
    expect(toKebabCase('acme2payments')).to.equal('acme2-payments');
  });

  // A digit after a lone capital is its own word, so `sdkV2` becomes `sdk-v-2` rather than `sdk-v2`.
  // Both are valid plugin ids and the id is only a default the user can overtype, so the split stands.
  it('separates digits that trail a lone capital', () => {
    expect(toKebabCase('sdkV2')).to.equal('sdk-v-2');
  });

  it('drops characters a plugin id may not carry', () => {
    expect(toKebabCase('acme@payments!')).to.equal('acme-payments');
  });

  it('returns an empty string when there is nothing to keep', () => {
    expect(toKebabCase('')).to.equal('');
    expect(toKebabCase('---')).to.equal('');
    expect(toKebabCase('!!!')).to.equal('');
  });

  // A non-empty result is fed straight into the plugin id prompt as its placeholder, so it has to
  // pass the same validation the user's own answer does.
  ['acme-payments', 'AcmePayments', 'APIMatic', 'acme sdk', '--acme--', 'acme@payments!', 'sdkV2'].forEach((input) => {
    it(`emits a valid plugin id for ${JSON.stringify(input)}`, () => {
      expect(toKebabCase(input)).to.match(PLUGIN_ID);
    });
  });
});

describe('toTitleCase', () => {
  it('capitalises each word of a kebab-case name', () => {
    expect(toTitleCase('acme-payments')).to.equal('Acme Payments');
  });

  it('capitalises each word of a snake_case name', () => {
    expect(toTitleCase('acme_payments_sdk')).to.equal('Acme Payments Sdk');
  });

  it('capitalises short words that a headline style would leave lower-case', () => {
    expect(toTitleCase('bank-of-acme')).to.equal('Bank Of Acme');
  });

  it('preserves the casing a word already carries after its first letter', () => {
    expect(toTitleCase('APIMatic-sdk')).to.equal('APIMatic Sdk');
    expect(toTitleCase('acmePayments')).to.equal('AcmePayments');
  });

  it('collapses runs of separators rather than emitting empty words', () => {
    expect(toTitleCase('acme--payments__sdk')).to.equal('Acme Payments Sdk');
    expect(toTitleCase('  acme payments  ')).to.equal('Acme Payments');
  });

  it('keeps digits as their own word when separators surround them', () => {
    expect(toTitleCase('acme-sdk-2')).to.equal('Acme Sdk 2');
  });

  it('returns an empty string when there is nothing to capitalise', () => {
    expect(toTitleCase('')).to.equal('');
    expect(toTitleCase('---')).to.equal('');
  });
});

// Both helpers are seeded from a project directory name, which the user chose and the OS accepted,
// so they have to survive any script at all. Neither recognises a letter outside ASCII, so the
// question these cover is not what they produce but that they always produce something, and never
// something the plugin id prompt would then reject.
describe('case conversion of non-Latin input', () => {
  const NON_LATIN = {
    'japanese kanji': '請求書',
    'japanese hiragana': 'せいきゅうしょ',
    'japanese katakana': 'アクメペイメント',
    chinese: '发票系统',
    korean: '결제서비스',
    cyrillic: 'Платежи',
    greek: 'Πληρωμές',
    arabic: 'مدفوعات',
    hebrew: 'תשלומים',
    thai: 'การชำระเงิน',
    devanagari: 'भुगतान',
    emoji: '🎉🎊',
    'lone high surrogate': '\uD83D',
    'lone low surrogate': '\uDE00'
  };

  Object.entries(NON_LATIN).forEach(([label, input]) => {
    it(`yields nothing rather than throwing for ${label}`, () => {
      expect(() => toKebabCase(input)).to.not.throw();
      expect(() => toTitleCase(input)).to.not.throw();
      expect(toKebabCase(input)).to.equal('');
      expect(toTitleCase(input)).to.equal('');
    });
  });

  it('keeps the ASCII part of a name that mixes scripts', () => {
    expect(toKebabCase('請求書API-v2')).to.equal('api-v2');
    expect(toTitleCase('請求書API-v2')).to.equal('API V2');
  });

  it('treats a non-breaking space as a separator', () => {
    expect(toKebabCase('acme\u00A0payments')).to.equal('acme-payments');
  });

  // Accented letters are dropped rather than folded to their ASCII base, so `münchen` loses its `ü`
  // instead of becoming `munchen`. Pinned because it is a silent loss, not because it is desirable.
  it('drops accented letters instead of folding them', () => {
    expect(toKebabCase('café-münchen')).to.equal('caf-m-nchen');
    expect(toKebabCase('straße')).to.equal('stra-e');
  });

  it('survives control characters and zero-width joiners', () => {
    expect(() => toKebabCase('a\u0000b')).to.not.throw();
    expect(toKebabCase('a\u0000b')).to.equal('a-b');
    expect(toKebabCase('a\u200Db')).to.equal('a-b');
  });

  // The whole point of the sweep: whatever the directory was called, the seeded id is either absent
  // or something the prompt will accept. There is no third outcome that reaches the user.
  it('only ever emits an empty string or a valid plugin id', () => {
    const everyInput = [
      ...Object.values(NON_LATIN),
      '請求書API-v2',
      'café-münchen',
      'straße',
      'a\u0000b',
      'acme\u00A0payments',
      '🎉-payments'
    ];

    everyInput.forEach((input) => {
      const kebab = toKebabCase(input);
      expect(kebab === '' || PLUGIN_ID.test(kebab), `${JSON.stringify(input)} produced ${JSON.stringify(kebab)}`).to.be
        .true;
    });
  });
});
