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
