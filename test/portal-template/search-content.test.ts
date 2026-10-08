import { expect } from 'chai';
import { withoutImages } from '../../portal-template/src/lib/search-content';

describe('withoutImages', () => {
  it('drops an image and keeps the text and code around it as written', () => {
    const description = 'Calculates it.\n\n![How a calculation flows](/images/diagram.png)\n\n```json\n{ "a": 9 }\n```';

    expect(withoutImages(description)).to.equal('Calculates it.\n\n\n\n```json\n{ "a": 9 }\n```');
  });

  it('drops a reference-style image and an image inside a link', () => {
    expect(withoutImages('See ![flow][f] here.\n\n[f]: /images/diagram.png')).to.equal(
      'See  here.\n\n[f]: /images/diagram.png'
    );
    expect(withoutImages('A [![badge](/b.png)](https://x.test) link.')).to.equal('A [](https://x.test) link.');
  });

  it('leaves Markdown without images as written', () => {
    const description = '- Some *text*, a [link](/x)\n- a table:\n\n| a | b |\n| - | - |\n| 1 | 2 |';

    expect(withoutImages(description)).to.equal(description);
  });
});
