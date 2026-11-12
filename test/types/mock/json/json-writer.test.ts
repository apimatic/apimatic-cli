import { expect } from 'chai';
import { readJson } from '../../../../src/types/mock/json/json-reader.js';
import { writeIndentedJson, writeJson } from '../../../../src/types/mock/json/json-writer.js';

const read = (text: string) => readJson(text)._unsafeUnwrap();

describe('writeJson', () => {
  it('writes a document compactly, with every number as it was read', () => {
    const document = read(
      '{ "id": 9007199254740993, "amount": 250.00, "rate": 1e2, "tags": [ "a", null, true ], "o": { } }'
    );

    const written = writeJson(document);

    expect(written).to.equal('{"id":9007199254740993,"amount":250.00,"rate":1e2,"tags":["a",null,true],"o":{}}');
  });

  it('leaves accents, punctuation and emoji as written, since people read these bodies', () => {
    const document = read('{"name":"Jos\\u00e9 O\'Brien & <Co> a+b 😀"}');

    const written = writeJson(document);

    expect(written).to.equal('{"name":"José O\'Brien & <Co> a+b 😀"}');
  });

  it('escapes what a JSON string cannot hold as it is', () => {
    const document = read('{"a\\"b":"line\\nbreak \\\\ \\u0001"}');

    const written = writeJson(document);

    expect(written).to.equal('{"a\\"b":"line\\nbreak \\\\ \\u0001"}');
  });

  it('keeps members in the order they were read', () => {
    const document = read('{"b":1,"10":2,"2":3,"a":4}');

    const written = writeJson(document);

    expect(written).to.equal('{"b":1,"10":2,"2":3,"a":4}');
  });
});

describe('writeIndentedJson', () => {
  it('writes two spaces a level, LF line ends and an empty container on one line', () => {
    const document = read('{"status":418,"differences":[{"where":"query","name":"q"}],"none":[],"empty":{}}');

    const written = writeIndentedJson(document);

    expect(written).to.equal(
      [
        '{',
        '  "status": 418,',
        '  "differences": [',
        '    {',
        '      "where": "query",',
        '      "name": "q"',
        '    }',
        '  ],',
        '  "none": [],',
        '  "empty": {}',
        '}'
      ].join('\n')
    );
  });
});
