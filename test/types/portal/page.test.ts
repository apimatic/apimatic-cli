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

    // The front matter check reports the first; the syntax error, the second.
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
  });

  // MDX looks each up in the components the portal provides, and only once a reader opens the page.
  describe('the components', () => {
    const components = async (markdown: string, name = 'page.mdx') => (await page(markdown, name)).components;

    it('names each component tag with its line, inside other tags and text too', async () => {
      const markdown =
        '---\ntitle: Home\n---\n\n<Banner variant="rainbow">Out now.</Banner>\n\n' +
        '<Tabs items={["a"]}>\n  <Tab>Text with <Badge /> in it.</Tab>\n</Tabs>\n';

      expect(await components(markdown)).to.deep.equal([
        { name: 'Banner', line: 5 },
        { name: 'Tabs', line: 7 },
        { name: 'Tab', line: 8 },
        { name: 'Badge', line: 8 }
      ]);
    });

    it('names a member tag whole, whatever the case of its object', async () => {
      expect(await components('<Icons.Star />\n\n<motion.div>x</motion.div>\n')).to.deep.equal([
        { name: 'Icons.Star', line: 1 },
        { name: 'motion.div', line: 3 }
      ]);
    });

    it('leaves out HTML tags and fragments', async () => {
      expect(await components('<div>\n  <svg:rect />\n  <my-element />\n</div>\n\n<>Fragment</>\n')).to.deep.equal([]);
    });

    it('leaves out what the page imports or exports itself', async () => {
      const markdown =
        "import { Banner } from 'fumadocs-ui/components/banner';\n" +
        "import Default, * as Icons from './icons';\n" +
        "export function Local() { return 'local'; }\n" +
        'export const Arrow = () => null, { Picked } = Icons;\n\n' +
        '<Banner />\n\n<Default />\n\n<Icons.Star />\n\n<Local />\n\n<Arrow />\n\n<Picked />\n\n<Missing />\n';

      expect((await components(markdown)).map(({ name }) => name)).to.deep.equal(['Missing']);
    });

    it('finds none in a .md page, where a tag is HTML', async () => {
      expect(await components('<Banner>Out now.</Banner>\n', 'page.md')).to.deep.equal([]);
    });

    // The page's syntax error is reported in their place.
    it('finds none in a page that does not parse, rather than throwing', async () => {
      expect(await components('<Banner>\n\nUnclosed.\n')).to.deep.equal([]);
      expect(await components('---\ntitle: [unclosed\n---\n<Banner />\n')).to.deep.equal([]);
    });
  });

  // A preview leaves such a page an error screen, and the build fails over it naming its temporary copy.
  describe('the first mistake in an .mdx page', () => {
    const syntaxError = async (body: string, name = 'page.mdx') =>
      (await page(`---\ntitle: Cards\n---\n\n${body}`, name)).syntaxError;

    it('places a tag left open at the tag, which MDX finds only at the end of the page', async () => {
      expect(await syntaxError('## One\n\n<Cards>\n  <Card title="a" />\n\n## Two\n')).to.deep.equal({
        line: 7,
        column: 1,
        reason: 'Expected a closing tag for `<Cards>`'
      });
    });

    it('places a closing tag that does not match at the closing tag, naming the line of the one it should close', async () => {
      expect(await syntaxError('<Cards>\n  Text\n</Card>\n')).to.deep.equal({
        line: 7,
        column: 1,
        reason: 'Unexpected closing tag `</Card>`, expected corresponding closing tag for `<Cards>` on line 5'
      });
    });

    it("gives what is wrong with an expression in acorn's words, and not its name", async () => {
      expect(await syntaxError('Then {oops(}.\n')).to.deep.equal({
        line: 5,
        column: 12,
        reason: 'Could not parse expression: Unexpected token'
      });
    });

    it('names an HTML comment as MDX does, with what to write instead', async () => {
      const found = await syntaxError('<!-- note -->\n');

      expect(found).to.include({ line: 5, column: 2 });
      expect(found?.reason).to.contain('use `{/* text */}`');
    });

    for (const [description, body, name] of [
      ['a valid page', '<Cards>\n  <Card title="a" />\n</Cards>\n\n{/* a comment */}\n', 'page.mdx'],
      ['a .md page, which is not read as MDX', '<Cards>\n\n<!-- note -->\n\nIf a <5.\n', 'page.md']
    ]) {
      it(`finds none in ${description}`, async () => {
        expect(await syntaxError(body, name)).to.be.null;
      });
    }
  });
});
