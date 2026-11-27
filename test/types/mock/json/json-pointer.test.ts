import { expect } from 'chai';
import { pointerSegment } from '../../../../src/types/mock/json/json-pointer.js';

describe('pointerSegment', () => {
  for (const [key, segment] of [
    ['owner', 'owner'],
    ['a/b', 'a~1b'],
    ['a~b', 'a~0b'],
    ['~/', '~0~1'],
    ['~1', '~01'],
    ['', '']
  ]) {
    it(`writes the key '${key}' as '${segment}'`, () => {
      const written = pointerSegment(key);

      expect(written).to.equal(segment);
    });
  }
});
