import path from 'node:path';
import { expect } from 'chai';
import { remark } from 'remark';
import remarkMdx from 'remark-mdx';
import { FileName } from '../../src/types/file/fileName';
import { parsePage } from '../../src/types/portal/page';
import { remarkJsxImages } from '../../portal-template/remark-jsx-images';

describe('the <img> tags of the .mdx content pages', () => {
  const project = path.resolve('/portal');
  const staticDirectory = path.join(project, 'static');
  const pageDirectory = path.join(project, 'content', 'guides');
  const processor = remark().use(remarkMdx);

  /** The page once the step has run, written back as MDX, the imports it adds at the top. */
  const transformed = (mdx: string, publicDir: string | false = staticDirectory): string => {
    const tree = processor.parse(mdx);
    remarkJsxImages({ publicDir })(tree, { dirname: pageDirectory });
    return processor.stringify(tree);
  };

  it('imports the file beside the page or in the static directory, keeping the other attributes', () => {
    expect(transformed('<img src="./flow.png" width="200" alt="Flow" />\n\n<img src="/images/logo.png" />\n')).to.equal(
      'import __jsxImg0 from "./flow.png"\n\nimport __jsxImg1 from "../../static/images/logo.png"\n\n' +
        '<img src={__jsxImg0} width="200" alt="Flow" />\n\n<img src={__jsxImg1} />\n'
    );
  });

  it('imports an <img> inside a line of text, and one inside a component', () => {
    expect(
      transformed('Inline <img src="../shared.png" /> here.\n\n<Card>\n  <img src="diagram.png" />\n</Card>\n')
    ).to.equal(
      'import __jsxImg0 from "../shared.png"\n\nimport __jsxImg1 from "./diagram.png"\n\n' +
        'Inline <img src={__jsxImg0} /> here.\n\n<Card>\n  <img src={__jsxImg1} />\n</Card>\n'
    );
  });

  it('reads the address without the spaces around it or its query or fragment, and decoded', () => {
    expect(transformed('<img src=" ./my%20flow.png?v=2#top " />\n')).to.equal(
      'import __jsxImg0 from "./my flow.png"\n\n<img src={__jsxImg0} />\n'
    );
  });

  it('leaves an address that names no file as written, and an <img> without one', () => {
    const mdx =
      [
        '<img src="https://example.com/a.png" />',
        '<img src="//cdn.example.com/a.png" />',
        '<img src="data:image/png;base64,AAAA" />',
        '<img src="" />',
        '<img src="images/" />',
        '<img src={logo} />',
        '<img alt="No address" />'
      ].join('\n\n') + '\n';

    expect(transformed(mdx)).to.equal(mdx);
  });

  it('leaves other tags as written, a component named Img among them', () => {
    const mdx = '<Img src="./a.png" />\n\n<image src="./a.png" />\n\n<video src="./a.mp4" />\n';

    expect(transformed(mdx)).to.equal(mdx);
  });

  it('leaves an address in the static directory as written when there is none', () => {
    expect(transformed('<img src="/images/logo.png" />\n\n<img src="./flow.png" />\n', false)).to.equal(
      'import __jsxImg0 from "./flow.png"\n\n<img src="/images/logo.png" />\n\n<img src={__jsxImg0} />\n'
    );
  });

  // The step runs on every page of the author's; in a `.md` page a tag is raw HTML, which the build leaves out.
  it("leaves a .md page's <img> as written", () => {
    const markdown = remark();
    const tree = markdown.parse('<img src="./flow.png">\n');
    remarkJsxImages({ publicDir: staticDirectory })(tree, { dirname: pageDirectory });

    expect(markdown.stringify(tree)).to.equal('<img src="./flow.png">\n');
  });

  it('leaves a page it has no path for as written', () => {
    const tree = processor.parse('<img src="./flow.png" />\n');
    remarkJsxImages({ publicDir: staticDirectory })(tree, {});

    expect(processor.stringify(tree)).to.equal('<img src="./flow.png" />\n');
  });

  // MDX compiles these programs, not the text the tests above read.
  it('gives MDX the program of each import and of the address', () => {
    const tree = processor.parse('<img src="./flow.png" />\n');
    remarkJsxImages({ publicDir: staticDirectory })(tree, { dirname: pageDirectory });
    const [esm, image] = tree.children as unknown as [
      { data: { estree: unknown } },
      { attributes: [{ value: { data: { estree: unknown } } }] }
    ];

    expect(esm.data.estree).to.deep.equal({
      type: 'Program',
      sourceType: 'module',
      body: [
        {
          type: 'ImportDeclaration',
          source: { type: 'Literal', value: './flow.png' },
          specifiers: [{ type: 'ImportDefaultSpecifier', local: { type: 'Identifier', name: '__jsxImg0' } }]
        }
      ]
    });
    expect(image.attributes[0].value.data.estree).to.deep.equal({
      type: 'Program',
      sourceType: 'module',
      body: [{ type: 'ExpressionStatement', expression: { type: 'Identifier', name: '__jsxImg0' } }]
    });
  });

  // The CLI reports a missing file before a build that would otherwise fail over its import, naming no page.
  it('imports exactly the files the CLI checks', async () => {
    const mdx =
      '---\ntitle: Images\n---\n\n<img src="/images/a%20b.png?v=1" />\n\nInline <img src="./c.png#top" /> here.\n\n' +
      '<Card>\n  <img src="../d.png" />\n</Card>\n\n<img src="https://example.com/e.png" />\n\n<img src={f} />\n\n' +
      '<img src=" ./g.png " />\n';
    const checked = (await parsePage(mdx, new FileName('page.mdx'), 'content/guides/page.mdx')).images;
    const imported = [...transformed(mdx).matchAll(/^import __jsxImg\d+ from "(.+)"$/gm)].map(([, source]) =>
      path.join(pageDirectory, source)
    );

    expect(imported).to.deep.equal(
      checked.map(({ from, path: file }) => path.join(from === 'static' ? staticDirectory : pageDirectory, file))
    );
  });

  (process.platform === 'win32' ? it : it.skip)(
    'imports a static file on another drive by its own path, which static-images.ts resolves',
    () => {
      const tree = processor.parse('<img src="/images/logo.png" />\n');
      remarkJsxImages({ publicDir: 'D:\\static' })(tree, { dirname: 'C:\\portal\\content' });

      expect(processor.stringify(tree)).to.equal(
        'import __jsxImg0 from "./D:/static/images/logo.png"\n\n<img src={__jsxImg0} />\n'
      );
    }
  );
});
