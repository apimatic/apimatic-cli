import { expect } from 'chai';
import { readJson } from '../../../../src/types/mock/json/json-reader.js';
import { Difference } from '../../../../src/types/mock/matching/difference.js';
import { compareJson } from '../../../../src/types/mock/matching/json-diff.js';

const json = (text: string) => readJson(text)._unsafeUnwrap();
const compare = (expected: string, actual: string) => compareJson(json(expected), json(actual));
const at = (name: string, expected: string, actual: string) => new Difference('body', name, expected, actual);

describe('compareJson', () => {
  for (const [title, expected, actual] of [
    ['the same keys in another order', '{"a":1,"b":{"c":[1,2]}}', '{"b":{"c":[1,2]},"a":1}'],
    [
      'a date-time rule met in another spelling',
      '{"at":{"$dateTime":"2026-01-01T00:00:00Z"}}',
      '{"at":"2026-01-01T01:00:00.000+01:00"}'
    ],
    [
      'a date-time rule met by a number of Unix seconds',
      '{"at":{"$dateTime":"2026-01-01T00:00:00Z"}}',
      '{"at":1767225600}'
    ],
    ['a rule at the root, which judges the whole document', '{"$contains":"xy"}', '"wxyz"'],
    ['a rule met as an item of an array', '{"keys":["a",{"$startsWith":"idem_"}]}', '{"keys":["a","idem_42"]}'],
    ['null against null', '{"n":null}', '{"n":null}'],
    ['empty containers', '{"a":[],"o":{}}', '{"o":{},"a":[]}'],
    ...[
      ['1.0', '1'],
      ['100', '1e2'],
      ['1e30', '1.0E30'],
      ['-0', '0'],
      ['1e99999999999999999999', '10e99999999999999999998']
    ].map(([first, second]) => [`the number ${first} written as ${second}`, `{"n":${first}}`, `{"n":${second}}`])
  ]) {
    it(`finds no difference in ${title}`, () => {
      const differences = compare(expected, actual);

      expect(differences).to.deep.equal([]);
    });
  }

  for (const [title, expected, actual, differences] of [
    [
      'a renamed key as one missing and one not expected',
      '{"counterparty_account_id":"x"}',
      '{"counterpartyAccountId":"x"}',
      [at('/counterparty_account_id', '"x"', 'absent'), at('/counterpartyAccountId', 'absent', '"x"')]
    ],
    [
      'a string against a number, which is how a Money sent as a number is caught',
      '{"amount":"250.00"}',
      '{"amount":250.00}',
      [at('/amount', '"250.00"', '250.00')]
    ],
    [
      'an int64 beyond 2^53 with its last digit kept',
      '{"sequence":9007199254740993}',
      '{"sequence":9007199254740992}',
      [at('/sequence', '9007199254740993', '9007199254740992')]
    ],
    ...[
      ['1e-30', '0'],
      ['1e-30', '2e-30'],
      ['0.12345678901234567890123456789', '0.12345678901234567890123456788'],
      ['1e30', '1e31'],
      ['-1', '1']
    ].map(
      ([first, second]) =>
        [
          `the number ${first} against ${second}, each as written`,
          `{"n":${first}}`,
          `{"n":${second}}`,
          [at('/n', first, second)]
        ] as const
    ),
    [
      'a string with accents and punctuation as it was written',
      '{"name":"José O\'Brien & <Co> a+b"}',
      '{"name":"Plain"}',
      [at('/name', '"José O\'Brien & <Co> a+b"', '"Plain"')]
    ],
    ['a string in another letter case', '{"n":"ACTIVE"}', '{"n":"active"}', [at('/n', '"ACTIVE"', '"active"')]],
    ['the other boolean', '{"n":true}', '{"n":false}', [at('/n', 'true', 'false')]],
    ['a value where null is expected', '{"n":null}', '{"n":1}', [at('/n', 'null', '1')]],
    ['null where a value is expected', '{"n":1}', '{"n":null}', [at('/n', '1', 'null')]],
    ['a number where an array is expected', '{"n":[1]}', '{"n":1}', [at('/n', '[1]', '1')]],
    ['a string where an object is expected', '{"n":{"a":1}}', '{"n":"a"}', [at('/n', '{"a":1}', '"a"')]],
    ['an array where a number is expected', '{"n":1}', '{"n":[1]}', [at('/n', '1', '[1]')]],
    [
      'arrays of different lengths as the whole array',
      '{"items":[1,2,3]}',
      '{"items":[1,2]}',
      [at('/items', '3 item(s)', '2 item(s)')]
    ],
    [
      'a nested difference under its full pointer',
      '{"data":[{"id":"a"},{"id":"b"}]}',
      '{"data":[{"id":"a"},{"id":"c"}]}',
      [at('/data/1/id', '"b"', '"c"')]
    ],
    [
      'keys that hold a slash or a tilde under escaped pointers',
      '{"a/b":1,"c~d":2}',
      '{"a/b":2,"c~d":3}',
      [at('/a~1b', '1', '2'), at('/c~0d', '2', '3')]
    ],
    ['another kind at the root under the empty pointer', '{"a":1}', '[1]', [at('', '{"a":1}', '[1]')]],
    ['a value under an empty key at the key, not at the root', '{"":1}', '{"":2}', [at('/', '1', '2')]],
    ['null against a missing key', '{"nickname":null}', '{}', [at('/nickname', 'null', 'absent')]],
    [
      "a date-time rule against another instant, in the rule's words",
      '{"at":{"$dateTime":"2026-01-01T00:00:00Z"}}',
      '{"at":"2026-01-01T01:00:00Z"}',
      [at('/at', 'a date-time equal to 2026-01-01T00:00:00Z', '"2026-01-01T01:00:00Z"')]
    ],
    [
      'a text rule against a number',
      '{"key":{"$startsWith":"idem_"}}',
      '{"key":42}',
      [at('/key', "a string starting with 'idem_'", '42')]
    ],
    [
      'a missing key that any value would have satisfied',
      '{"memo":{"$any":true}}',
      '{}',
      [at('/memo', 'any value', 'absent')]
    ],
    [
      'a rule inside an array under its full pointer',
      '{"items":[{"at":"a"},{"at":{"$endsWith":"z"}}]}',
      '{"items":[{"at":"a"},{"at":"abc"}]}',
      [at('/items/1/at', "a string ending with 'z'", '"abc"')]
    ],
    [
      'a rule that is an item of an array, at the item',
      '{"keys":["a",{"$startsWith":"idem_"}]}',
      '{"keys":["a","x"]}',
      [at('/keys/1', "a string starting with 'idem_'", '"x"')]
    ],
    [
      'an object shaped like a rule on the actual side as the ordinary object it is',
      '{"memo":{"note":"x"}}',
      '{"memo":{"$any":true}}',
      [at('/memo/note', '"x"', 'absent'), at('/memo/$any', 'absent', 'true')]
    ]
  ] as const) {
    it(`reports ${title}`, () => {
      const found = compare(expected, actual);

      expect(found).to.deep.equal(differences);
    });
  }

  it('names the place the caller gives it', () => {
    const differences = compareJson(json('1'), json('2'), 'part');

    expect(differences).to.deep.equal([new Difference('part', '', '1', '2')]);
  });

  it('writes the same actual array out once, however many stubs it is compared with', () => {
    const actual = json('[1,{"b":2}]');

    const reported = [compareJson(json('{}'), actual), compareJson(json('{"other":true}'), actual)].map(
      ([difference]) => difference.actual
    );

    expect(reported).to.deep.equal(['[1,{"b":2}]', '[1,{"b":2}]']);
  });
});
