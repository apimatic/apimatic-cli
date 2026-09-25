import { expect } from 'chai';
import { frontmatter } from 'fumadocs-core/content/md/frontmatter';
import { pageSchema } from 'fumadocs-core/source/schema';
import { parsePageFrontMatter } from '../../../src/types/portal/page-front-matter';

describe('parsePageFrontMatter', () => {
  const title = async (markdown: string) =>
    (await parsePageFrontMatter(markdown, 'content/page.md')).map(({ title }) => title);

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
