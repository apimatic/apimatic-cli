import { expect } from 'chai';
import { frontmatter } from 'fumadocs-core/content/md/frontmatter';
import { pageSchema } from 'fumadocs-core/source/schema';
import { FileName } from '../../../src/types/file/fileName';
import { parsePage } from '../../../src/types/portal/page';

describe('parsePage', () => {
  const page = (markdown: string, name = 'page.md') => parsePage(markdown, new FileName(name), `content/${name}`);

  describe('the front matter', () => {
    const title = async (markdown: string) => (await page(markdown)).frontMatter.map(({ title }) => title);

    it('reads the title from the front matter', async () => {
      expect((await title('---\ntitle: Learn the API\ndescription: More\n---\n\n# Body'))._unsafeUnwrap()).to.equal(
        'Learn the API'
      );
    });

    it('reads front matter written with Windows line endings', async () => {
      expect((await title('---\r\ntitle: Learn\r\n---\r\nBody'))._unsafeUnwrap()).to.equal('Learn');
    });

    // The build's own parser, which does not need a line break after the closing marker.
    it('reads front matter whose closing marker the body follows on the same line', async () => {
      expect((await title('---\ntitle: Learn\n--- \nBody'))._unsafeUnwrap()).to.equal('Learn');
    });

    for (const [description, markdown, error] of [
      ['no front matter', '# Learn the API', 'content/page.md has no front matter, which is where its title goes.'],
      [
        'front matter that is not at the top',
        '\n---\ntitle: Learn\n---\n',
        'content/page.md has no front matter, which is where its title goes.'
      ],
      [
        'front matter with no title',
        '---\ndescription: More\n---\n',
        "content/page.md has no 'title' in its front matter."
      ],
      ['a title left blank', '---\ntitle:\n---\n', "content/page.md: 'title' must not be empty."],
      [
        'a title that is a number',
        '---\ntitle: 404\n---\n',
        "content/page.md: 'title' must be text. Put it in quotes if it looks like a number or true or false."
      ],
      ['an empty title', '---\ntitle: "  "\n---\n', "content/page.md: 'title' must not be empty."],
      [
        'a description that is not text',
        '---\ntitle: Learn\ndescription: [a, b]\n---\n',
        "content/page.md: 'description' must be text."
      ],
      [
        'a full setting that is not a boolean',
        '---\ntitle: Learn\nfull: "yes"\n---\n',
        "content/page.md: 'full' must be true or false."
      ]
    ]) {
      it(`refuses ${description}`, async () => {
        expect((await title(markdown))._unsafeUnwrapErr()).to.deep.equal([error]);
      });
    }

    it('says where front matter that is not YAML goes wrong', async () => {
      const [error] = (await title('---\ntitle: "unclosed\n---\n'))._unsafeUnwrapErr();

      expect(error).to.match(/^content\/page\.md: its front matter is not valid YAML\. \S/);
      expect(error).to.not.contain('\n');
    });

    it('reports every field the build would refuse at once', async () => {
      expect((await title('---\ntitle: true\nicon: 1\n---\n'))._unsafeUnwrapErr()).to.have.lengthOf(2);
    });

    // The field fumadocs-openapi writes, which no page of the user's should carry.
    it('passes on the schema’s own words for a field it has none of its own for', async () => {
      expect((await title('---\ntitle: Learn\n_openapi: 3\n---\n'))._unsafeUnwrapErr()).to.deep.equal([
        "content/page.md: '_openapi': Invalid input: expected record, received number."
      ]);
    });

    // The build validates each page against Fumadocs' schema; beyond it, the CLI refuses only a blank title.
    describe('the build’s page schema', () => {
      for (const markdown of [
        '# No front matter',
        '---\ndescription: More\n---\n',
        '---\ntitle:\n---\n',
        '---\ntitle: 404\n---\n',
        '---\ntitle: [a]\n---\n',
        '---\ntitle: Learn\ndescription: 1\n---\n',
        '---\ntitle: Learn\nicon: true\n---\n',
        '---\ntitle: Learn\nfull: "yes"\n---\n',
        '---\ntitle: Learn\ndescription:\n---\n',
        '---\ntitle: Learn\ndescription: More\nicon: Book\nfull: true\nother: 1\n---\n'
      ]) {
        it(`answers ${JSON.stringify(markdown)} as the schema does`, async () => {
          expect((await title(markdown)).isOk()).to.equal(pageSchema.safeParse(frontmatter(markdown).data).success);
        });
      }
    });
  });

  describe('the images', () => {
    const images = async (markdown: string, name?: string) => (await page(markdown, name)).images;

    it('says where the build reads each image from, decoded and without its query or fragment', async () => {
      expect(await images('![a](/images/a%20b.png?v=1)\n\n![b](../shared/b.png#x)\n')).to.deep.equal([
        { url: '/images/a%20b.png?v=1', line: 1, from: 'static', path: 'images/a b.png' },
        { url: '../shared/b.png#x', line: 3, from: 'page', path: '../shared/b.png' }
      ]);
    });

    it('counts the lines of the front matter it leaves out', async () => {
      expect((await images('---\ntitle: Home\n---\n\n![a](/a.png)\n')).map(({ line }) => line)).to.deep.equal([5]);
    });

    // The front matter check reports the first; the build reports the second.
    it('finds nothing in a page that does not parse, rather than throwing', async () => {
      expect(await images('---\ntitle: [unclosed\n---\n![a](/a.png)\n')).to.deep.equal([]);
      expect(await images('<Callout>\n\n![a](/a.png)\n', 'page.mdx')).to.deep.equal([]);
    });

    // An address and a folder are left to the browser, and so is a reference with no definition, which is text.
    it('leaves out what the build does not import', async () => {
      const markdown =
        '![a][nowhere]\n\n![b](https://example.com/b.png)\n\n![c](//cdn.example.com/c.png)\n\n' +
        '![d](data:image/png;base64,AA)\n\n![e](/images/)\n\n![f]()\n\n![g][remote]\n\n[remote]: https://example.com/g.png\n';

      expect(await images(markdown)).to.deep.equal([]);
    });

    // The template writes each as an inline image before the build imports it.
    it('reads a reference-style image from the first definition of its label, at the reference', async () => {
      const markdown = 'Intro.\n\n![a][Logo]\n\n[logo]: /images/logo.png "Logo"\n[logo]: /images/other.png\n';

      expect(await images(markdown)).to.deep.equal([
        { url: '/images/logo.png', line: 3, from: 'static', path: 'images/logo.png' }
      ]);
    });

    it('reads a .md page as Markdown, where a tag is HTML and an image after it still counts', async () => {
      const found = await images('<div>\n\n![a](/a.png)\n\n</div>\n\nA { brace }\n');

      expect(found.map(({ path }) => path)).to.deep.equal(['a.png']);
    });

    it('reads an .mdx page as MDX, where an image inside a component is still an image', async () => {
      const found = await images('<Callout>\n\n![a](/a.png)\n\n</Callout>\n', 'page.mdx');

      expect(found.map(({ path, line }) => [path, line])).to.deep.equal([['a.png', 3]]);
    });

    it('reads the src of an <img> in an .mdx page, in a line of text or a component too', async () => {
      const mdx =
        '<img src="/images/a%20b.png?v=1" width="200" />\n\nInline <img src="./b.png" /> here.\n\n' +
        '<Card>\n  <img alt="C" src="../c.png" />\n</Card>\n';

      expect(await images(mdx, 'page.mdx')).to.deep.equal([
        { url: '/images/a%20b.png?v=1', line: 1, from: 'static', path: 'images/a b.png' },
        { url: './b.png', line: 3, from: 'page', path: './b.png' },
        { url: '../c.png', line: 6, from: 'page', path: '../c.png' }
      ]);
    });

    it('reads the src of an <img> without the spaces around it, as a browser does', async () => {
      expect(await images('<img src=" /images/a.png " />\n', 'page.mdx')).to.deep.equal([
        { url: ' /images/a.png ', line: 1, from: 'static', path: 'images/a.png' }
      ]);
    });

    it('leaves out an <img> whose src names no file or is code, and other tags', async () => {
      const mdx =
        '<img src="https://example.com/a.png" />\n\n<img src={logo} />\n\n<img alt="None" />\n\n' +
        '<Img src="./a.png" />\n\n<video src="./a.mp4" />\n';

      expect(await images(mdx, 'page.mdx')).to.deep.equal([]);
    });

    // The build leaves out a `.md` page's HTML, an `<img>` with the rest.
    it('leaves out an <img> in a .md page', async () => {
      expect(await images('<img src="./a.png">\n\nInline <img src="./b.png"> here.\n')).to.deep.equal([]);
    });
  });

  // The build leaves out every piece of HTML in a `.md` page, and the reader loses what it says.
  describe('the tags of a .md page', () => {
    const tags = async (markdown: string, name?: string) => (await page(markdown, name)).droppedTags;

    it('names each piece of HTML by the first tag it opens, or else the first it closes, at its line', async () => {
      const markdown =
        '---\ntitle: Tags\n---\n\nLine one<br>line two.\n\n<details>\n<summary>More</summary>\n\nHidden.\n\n' +
        '</details>\n\n<Cards>\n  <Card title="A" href="/a" />\n</Cards>\n';

      expect(await tags(markdown)).to.deep.equal([
        { name: 'br', closing: false, line: 5 },
        { name: 'details', closing: false, line: 7 },
        { name: 'details', closing: true, line: 12 },
        { name: 'Cards', closing: false, line: 14 }
      ]);
    });

    it('names a tag opened after one is closed at the line it is opened on', async () => {
      const markdown = '<details>\n<summary>A</summary>\n\nText.\n\n</details>\n<details>\n<summary>B</summary>\n';

      expect(await tags(markdown)).to.deep.equal([
        { name: 'details', closing: false, line: 1 },
        { name: 'details', closing: false, line: 7 }
      ]);
    });

    // Markdown shows the opening tag of a component with a `{…}` attribute as text, and leaves out its end.
    it('names a piece that only closes a tag, such as the end of a component or text after a closing tag', async () => {
      const markdown = "<Tabs items={['npm', 'pnpm']}>\n\nnpm i\n\n</Tabs>\n\n</div>\nThis line is left out too.\n";

      expect(await tags(markdown)).to.deep.equal([
        { name: 'Tabs', closing: true, line: 5 },
        { name: 'div', closing: true, line: 7 }
      ]);
    });

    // A comment shows on no page either way.
    it('leaves out a comment and a tag inside one, but not a tag after one', async () => {
      const markdown =
        '<!-- <b>Draft</b> -->\n\nText <!-- note --> here.\n\n<!--\nA note.\n--> <span>Kept?</span>\n\n' +
        '<!---> <i>After an empty comment</i>\n';

      expect(await tags(markdown)).to.deep.equal([
        { name: 'span', closing: false, line: 7 },
        { name: 'i', closing: false, line: 9 }
      ]);
    });

    it('reads code, inline code and an autolink as the text they are', async () => {
      const markdown = '```html\n<div>\n```\n\nWrite `<br>` for a break, or see <https://example.com>.\n';

      expect(await tags(markdown)).to.deep.equal([]);
    });

    it('names none in an .mdx page, which renders its tags', async () => {
      expect(await tags('Line one<br />line two.\n\n<details>\n\nText.\n\n</details>\n', 'page.mdx')).to.deep.equal([]);
    });
  });
});
