import { expect } from 'chai';
import { readJson } from '../../../../src/types/mock/json/json-reader.js';
import { JsonValue } from '../../../../src/types/mock/json/json-value.js';
import {
  describeJsonRule,
  JsonRule,
  JsonRuleReading,
  jsonRuleAccepts,
  readJsonRule
} from '../../../../src/types/mock/stub-format/json-rule.js';

const json = (text: string): JsonValue => readJson(text)._unsafeUnwrap();

const reading = (text: string): JsonRuleReading => {
  const candidate = json(text);
  if (candidate.kind !== 'object') {
    throw new Error(`${text} is not an object.`);
  }
  return readJsonRule(candidate.members);
};

const rule = (text: string): JsonRule => {
  const read = reading(text);
  if (read.kind !== 'found') {
    throw new Error(`${text} is not a rule.`);
  }
  return read.rule;
};

describe('readJsonRule', () => {
  for (const [text, description] of [
    ['{"$startsWith":"idem_"}', "a string starting with 'idem_'"],
    ['{"$endsWith":".pdf"}', "a string ending with '.pdf'"],
    ['{"$contains":"@"}', "a string containing '@'"],
    ['{"$dateTime":"2026-01-01T01:00:00+01:00"}', 'a date-time equal to 2026-01-01T00:00:00Z'],
    ['{"$any":true}', 'any value']
  ]) {
    it(`reads ${text} as a rule that asks for ${description}`, () => {
      const found = rule(text);

      const described = describeJsonRule(found);

      expect(described).to.equal(description);
    });
  }

  for (const text of ['{"note":"x"}', '{"$startsWith":"a","$endsWith":"b"}', '{}', '{"price":{"$any":true}}']) {
    it(`reads ${text} as an ordinary object`, () => {
      const read = reading(text);

      expect(read).to.deep.equal({ kind: 'none' });
    });
  }

  for (const [text, name, fault] of [
    ['{"$startswith":"a"}', '$startswith', 'not a rule'],
    ['{"$literal":"a"}', '$literal', 'not a rule'],
    ['{"$dateTime":"soon"}', '$dateTime', 'not a date-time'],
    ['{"$dateTime":1767225600}', '$dateTime', 'takes a string'],
    ['{"$any":false}', '$any', 'takes true'],
    ['{"$any":"yes"}', '$any', 'takes true'],
    ['{"$startsWith":""}', '$startsWith', 'non-empty string'],
    ['{"$contains":7}', '$contains', 'non-empty string']
  ]) {
    it(`reads ${text} as a rule spelled wrong, naming ${name}`, () => {
      const read = reading(text);

      expect(read).to.include({ kind: 'malformed', name });
      expect(read.kind === 'malformed' ? read.message : '').to.include(fault);
    });
  }
});

describe('jsonRuleAccepts', () => {
  for (const [expected, actual, accepted] of [
    ['{"$startsWith":"idem_"}', '"idem_1"', true],
    ['{"$startsWith":"idem_"}', '"1"', false],
    ['{"$startsWith":"1"}', '12', false],
    ['{"$contains":"b"}', 'null', false],
    ['{"$dateTime":"2026-01-01T00:00:00Z"}', '"2026-01-01T01:00:00+01:00"', true],
    ['{"$dateTime":"2026-01-01T00:00:00Z"}', '1767225600', true],
    ['{"$dateTime":"2026-01-01T00:00:00Z"}', '"1767225600"', true],
    ['{"$dateTime":"2026-01-01T00:00:00Z"}', '1767225601', false],
    ['{"$dateTime":"2026-01-01T00:00:00Z"}', '1767225600.0', true],
    ['{"$dateTime":"2026-01-01T00:00:00Z"}', '1.7672256e9', true],
    ['{"$dateTime":"2026-01-01T00:00:00Z"}', '17672256E2', true],
    ['{"$dateTime":"2026-01-01T00:00:00Z"}', '1767225600.25', false],
    ['{"$dateTime":"2026-01-01T00:00:00Z"}', '1e400', false],
    ['{"$dateTime":"1969-12-31T23:59:59Z"}', '-1', true],
    ['{"$dateTime":"1969-12-31T23:59:59Z"}', '-1.0', true],
    ['{"$dateTime":"2026-01-01T00:00:00Z"}', 'true', false],
    ['{"$dateTime":"2026-01-01T00:00:00Z"}', '{"$dateTime":"2026-01-01T00:00:00Z"}', false],
    ['{"$any":true}', '{"anything":[1]}', true],
    ['{"$any":true}', 'null', true]
  ] as const) {
    it(`${accepted ? 'accepts' : 'refuses'} ${actual} under ${expected}`, () => {
      const expectedRule = rule(expected);

      const result = jsonRuleAccepts(expectedRule, json(actual));

      expect(result).to.equal(accepted);
    });
  }
});
