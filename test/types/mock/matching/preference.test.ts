import { expect } from 'chai';
import { parsePreference } from '../../../../src/types/mock/matching/preference.js';

describe('parsePreference', () => {
  for (const [prefer, code] of [
    ['code=404', 404],
    ['respond-async, code=500', 500],
    ['return=representation; code=422', 422],
    ['return=minimal, code=404', 404],
    ['CODE=503', 503],
    ['code = 404', 404],
    ['code =\t409', 409],
    ['code="404"', 404],
    ['respond-async, code = "429"', 429]
  ] as const) {
    it(`reads the status ${code} in '${prefer}'`, () => {
      const preference = parsePreference([prefer]);

      expect(preference).to.deep.equal({ code });
    });
  }

  for (const prefer of [
    'code=abc',
    'code=abc, code=404',
    'code',
    'encode=404',
    'respond-async',
    'code=-1',
    'code=4.0',
    ''
  ]) {
    it(`reads no status in '${prefer}'`, () => {
      const preference = parsePreference([prefer]);

      expect(preference).to.deep.equal({});
    });
  }

  for (const [prefer, example] of [
    ['example=noItems', 'noItems'],
    ['EXAMPLE=NoItems', 'NoItems'],
    ['example = "page 2"', 'page 2']
  ] as const) {
    it(`reads the example name as written in '${prefer}'`, () => {
      const preference = parsePreference([prefer]);

      expect(preference).to.deep.equal({ example });
    });
  }

  for (const prefer of ['example=', 'example=""', 'examples=noItems', 'example=, example=noItems']) {
    it(`reads no example in '${prefer}'`, () => {
      const preference = parsePreference([prefer]);

      expect(preference).to.deep.equal({});
    });
  }

  for (const [title, values, expected] of [
    ['asks for nothing without a header', [], {}],
    ['takes the first of two code tokens', ['code=404', 'code=500'], { code: 404 }],
    ['takes the first of two example tokens', ['example=noItems', 'example=firstPage'], { example: 'noItems' }],
    [
      'reads a code and an example from one header',
      ['code=404; example=unknownAccount'],
      { code: 404, example: 'unknownAccount' }
    ],
    [
      'reads a quoted example after a code',
      ['code=404, example="unknownAccount"'],
      { code: 404, example: 'unknownAccount' }
    ]
  ] as const) {
    it(title, () => {
      const preference = parsePreference(values);

      expect(preference).to.deep.equal(expected);
    });
  }
});
