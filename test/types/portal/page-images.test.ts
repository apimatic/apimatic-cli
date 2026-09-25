import { expect } from 'chai';
import { pageImages } from '../../../src/types/portal/page-images';

describe('pageImages', () => {
  it('says where the build reads each image from, decoded and without its query or fragment', async () => {
    const images = await pageImages('![a](/images/a%20b.png?v=1)\n\n![b](../shared/b.png#x)\n', false);

    expect(images).to.deep.equal([
      { url: '/images/a%20b.png?v=1', line: 1, from: 'static', path: 'images/a b.png' },
      { url: '../shared/b.png#x', line: 3, from: 'page', path: '../shared/b.png' }
    ]);
  });

  it('counts the lines of the front matter it leaves out', async () => {
    const images = await pageImages('---\ntitle: Home\n---\n\n![a](/a.png)\n', false);

    expect(images.map(({ line }) => line)).to.deep.equal([5]);
  });

  // The front matter and MDX checks report these; the build would, too.
  it('finds nothing in a page that does not parse, rather than throwing', async () => {
    expect(await pageImages('---\ntitle: [unclosed\n---\n![a](/a.png)\n', false)).to.deep.equal([]);
    expect(await pageImages('<Callout>\n\n![a](/a.png)\n', true)).to.deep.equal([]);
  });

  // Fumadocs imports only inline images; a reference, an address and a folder are left to the browser.
  it('leaves out what the build does not import', async () => {
    const markdown =
      '![a][logo]\n\n[logo]: /logo.png\n\n![b](https://example.com/b.png)\n\n![c](//cdn.example.com/c.png)\n\n' +
      '![d](data:image/png;base64,AA)\n\n![e](/images/)\n\n![f]()\n';

    expect(await pageImages(markdown, false)).to.deep.equal([]);
  });

  it('reads a .md page as Markdown, where a tag is HTML and an image after it still counts', async () => {
    const images = await pageImages('<div>\n\n![a](/a.png)\n\n</div>\n\nA { brace }\n', false);

    expect(images.map(({ path }) => path)).to.deep.equal(['a.png']);
  });
});
