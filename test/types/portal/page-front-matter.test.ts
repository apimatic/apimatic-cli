import { expect } from 'chai';
import { frontmatter } from 'fumadocs-core/content/md/frontmatter';
import { pageSchema } from 'fumadocs-core/source/schema';
import { OPTIONAL_PAGE_FIELDS, PageFrontMatter } from '../../../src/types/portal/page-front-matter';

describe('PageFrontMatter', () => {
  const title = (markdown: string) => PageFrontMatter.title(markdown, 'content/page.md');

  it('reads the title from the front matter', () => {
    expect(title('---\ntitle: Learn the API\ndescription: More\n---\n\n# Body')._unsafeUnwrap()).to.equal(
      'Learn the API'
    );
  });

  it('reads front matter written with Windows line endings', () => {
    expect(title('---\r\ntitle: Learn\r\n---\r\nBody')._unsafeUnwrap()).to.equal('Learn');
  });

  // The build's own parser, which does not need a line break after the closing marker.
  it('reads front matter whose closing marker the body follows on the same line', () => {
    expect(title('---\ntitle: Learn\n--- \nBody')._unsafeUnwrap()).to.equal('Learn');
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
    ['a title left blank', '---\ntitle:\n---\n', "content/page.md has no 'title' in its front matter."],
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
    it(`refuses ${description}`, () => {
      expect(title(markdown)._unsafeUnwrapErr()).to.deep.equal([error]);
    });
  }

  it('says where front matter that is not YAML goes wrong', () => {
    const [error] = title('---\ntitle: "unclosed\n---\n')._unsafeUnwrapErr();

    expect(error).to.match(/^content\/page\.md: its front matter is not valid YAML\. \S/);
    expect(error).to.not.contain('\n');
  });

  it('reports every field the build would refuse at once', () => {
    expect(title('---\ntitle: true\nicon: 1\n---\n')._unsafeUnwrapErr()).to.have.lengthOf(2);
  });

  // The build validates each page against Fumadocs' schema; the CLI has to refuse at least as much.
  describe('the build’s page schema', () => {
    it('has no field the CLI does not check, but for the one fumadocs-openapi writes', () => {
      const checked = ['title', ...Object.keys(OPTIONAL_PAGE_FIELDS), '_openapi'];

      expect(Object.keys(pageSchema.shape)).to.have.members(checked);
    });

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
      it(`answers ${JSON.stringify(markdown)} as the schema does`, () => {
        expect(title(markdown).isOk()).to.equal(pageSchema.safeParse(frontmatter(markdown).data).success);
      });
    }
  });
});
