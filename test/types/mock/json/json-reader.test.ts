import { expect } from 'chai';
import { MAX_JSON_DEPTH, readHandWrittenJson, readJson } from '../../../../src/types/mock/json/json-reader.js';
import { JsonValue } from '../../../../src/types/mock/json/json-value.js';

const nested = (levels: number): string => '['.repeat(levels) + ']'.repeat(levels);
const membersOf = (value: JsonValue): [string, JsonValue][] => (value.kind === 'object' ? [...value.members] : []);

describe('readJson', () => {
  it('reads every kind of value', () => {
    const text = '{"s":"x","n":1,"t":true,"f":false,"z":null,"a":[1,"x"],"o":{}}';

    const value = readJson(text)._unsafeUnwrap();

    expect(membersOf(value)).to.deep.equal([
      ['s', { kind: 'string', value: 'x' }],
      ['n', { kind: 'number', text: '1' }],
      ['t', { kind: 'boolean', value: true }],
      ['f', { kind: 'boolean', value: false }],
      ['z', { kind: 'null' }],
      [
        'a',
        {
          kind: 'array',
          items: [
            { kind: 'number', text: '1' },
            { kind: 'string', value: 'x' }
          ]
        }
      ],
      ['o', { kind: 'object', members: new Map() }]
    ]);
  });

  for (const number of ['1.0', '1e2', '1E+30', '-0', '250.00', '9007199254740993', '0.12345678901234567890123456789']) {
    it(`keeps the number ${number} as it was written`, () => {
      const value = readJson(` ${number} `)._unsafeUnwrap();

      expect(value).to.deep.equal({ kind: 'number', text: number });
    });
  }

  it('keeps members in the order written, where a plain object would move a number-like name first', () => {
    const text = '{"b":1,"10":2,"2":3,"__proto__":4,"a":5}';

    const value = readJson(text)._unsafeUnwrap();

    expect(membersOf(value).map(([name]) => name)).to.deep.equal(['b', '10', '2', '__proto__', 'a']);
  });

  for (const [text, decoded] of [
    ['"\\"\\\\\\/\\b\\f\\n\\r\\t"', '"\\/\b\f\n\r\t'],
    ['"\\u00e9\\u00E9"', 'éé'],
    ['"\\ud83d\\ude00"', '😀'],
    ['"José 😀"', 'José 😀'],
    ['""', '']
  ]) {
    it(`decodes the string ${text}`, () => {
      const value = readJson(text)._unsafeUnwrap();

      expect(value).to.deep.equal({ kind: 'string', value: decoded });
    });
  }

  it(`reads containers nested ${MAX_JSON_DEPTH} deep`, () => {
    const text = nested(MAX_JSON_DEPTH);

    const reading = readJson(text);

    expect(reading.isOk()).to.be.true;
  });

  for (const [title, text, fault] of [
    ['a key written twice', '{"a":1,"a":2}', "Duplicate property 'a' at line 1, column 8."],
    [
      'a key written twice under another key',
      '{"o":{"name":1,\n "name":2}}',
      "Duplicate property 'name' at line 2, column 2."
    ],
    [
      'a high surrogate without its pair',
      '{"a":{"b":["ok","\\ud83d"]}}',
      'A string holds a lone surrogate, which is half a character at line 1, column 17.'
    ],
    ['a low surrogate without its pair', '"\\udc00"', 'lone surrogate'],
    ['a surrogate pair written backwards', '"\\ude00\\ud83d"', 'lone surrogate'],
    ['a lone surrogate in a key', '{"\\ud83d":1}', 'lone surrogate'],
    ['a trailing comma in an array', '[1,]', "']' is not the start of a JSON value at line 1, column 4."],
    ['a trailing comma in an object', '{"a":1,}', "Expected a property name in quotes, found '}' at line 1, column 8."],
    ['a comment', '[1] // one', "'/' follows the end of the JSON value at line 1, column 5."],
    ['a number with a leading zero', '[01]', "'01' is not a JSON number at line 1, column 2."],
    ['a number that ends in its point', '1.', "'1.' is not a JSON number at line 1, column 1."],
    ['a number that starts with its point', '.5', "'.' is not the start of a JSON value at line 1, column 1."],
    ['a number with a plus sign', '+1', "'+' is not the start of a JSON value at line 1, column 1."],
    ['a number with an empty exponent', '1e', "'1e' is not a JSON number at line 1, column 1."],
    ['a minus alone', '-', "'-' is not a JSON number at line 1, column 1."],
    ['a word that is no literal', 'NaN', "'N' is not the start of a JSON value at line 1, column 1."],
    ['a literal cut short', 'tru', "'t' is not the start of a JSON value at line 1, column 1."],
    ['a string in single quotes', "'a'", "''' is not the start of a JSON value at line 1, column 1."],
    ['a line break inside a string', '"a\nb"', 'A string holds U+000A unescaped at line 1, column 3.'],
    ['an escape JSON does not have', '"\\x41"', "'\\x' is not a JSON escape at line 1, column 2."],
    ['a unicode escape cut short', '"\\u12"', "'\\u' is not a JSON escape at line 1, column 2."],
    ['a string that is never closed', '["abc', 'A string is never closed at line 1, column 2.'],
    ['an array that is never closed', '[1', "Expected ',' or ']', found the end of the text at line 1, column 3."],
    ['an object without a colon', '{"a" 1}', "Expected ':' after the property name, found '1' at line 1, column 6."],
    ['a key without quotes', '{a:1}', "Expected a property name in quotes, found 'a' at line 1, column 2."],
    ['no text at all', '', 'the end of the text is not the start of a JSON value at line 1, column 1.'],
    ['whitespace alone', ' \n ', 'the end of the text is not the start of a JSON value at line 2, column 2.'],
    ['a second value', '1 2', "'2' follows the end of the JSON value at line 1, column 3."],
    ['a byte-order mark', '\ufeff{}', 'U+FEFF is not the start of a JSON value at line 1, column 1.'],
    ['a non-breaking space between values', '[1,\u00a02]', 'is not the start of a JSON value at line 1, column 4.'],
    [
      `containers nested ${MAX_JSON_DEPTH + 1} deep`,
      nested(MAX_JSON_DEPTH + 1),
      `The JSON nests deeper than ${MAX_JSON_DEPTH} levels at line 1, column 65.`
    ]
  ]) {
    it(`refuses ${title}`, () => {
      const reading = readJson(text);

      expect(reading._unsafeUnwrapErr()).to.include(fault);
    });
  }
});

describe('readHandWrittenJson', () => {
  it('skips comments and allows a comma before a closing bracket', () => {
    const text = '// the stubs\n[ /* first */ {"a": [1, 2,], }, ] // end';

    const value = readHandWrittenJson(text)._unsafeUnwrap();

    expect(value).to.deep.equal(readJson('[{"a":[1,2]}]')._unsafeUnwrap());
  });

  for (const [title, text, fault] of [
    ['a comma with nothing before it', '[,]', "',' is not the start of a JSON value at line 1, column 2."],
    ['two commas in a row', '[1,,2]', "',' is not the start of a JSON value at line 1, column 4."],
    ['a key written twice', '{"a":1, /* again */ "a":2}', "Duplicate property 'a' at line 1, column 21."],
    ['a comment that is never closed', '[1] /* open', 'A comment is never closed at line 1, column 5.'],
    [
      'a fault after two comment lines, at its own line',
      '// one\n// two\n[1 2]',
      "Expected ',' or ']', found '2' at line 3, column 4."
    ]
  ]) {
    it(`refuses ${title}`, () => {
      const reading = readHandWrittenJson(text);

      expect(reading._unsafeUnwrapErr()).to.equal(fault);
    });
  }
});
