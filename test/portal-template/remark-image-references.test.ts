import { expect } from 'chai';
import { remark } from 'remark';
import { FileName } from '../../src/types/file/fileName';
import { parsePage } from '../../src/types/portal/page';
import { remarkImageReferences } from '../../portal-template/src/lib/remark-image-references';

describe('the reference-style images of the content pages', () => {
  interface Node {
    type: string;
    url?: string;
    title?: string | null;
    alt?: string | null;
    children?: Node[];
  }

  /** A page's tree once the step has run, as `remarkImage` receives it. */
  const transformed = (markdown: string): Node => {
    const tree = remark().parse(markdown) as Node;
    remarkImageReferences()(tree);
    return tree;
  };

  const all = (node: Node, type: string): Node[] => [
    ...(node.type === type ? [node] : []),
    ...(node.children ?? []).flatMap((child) => all(child, type))
  ];

  it('writes a reference as an inline image, its address and title from the definition, its text from the reference', () => {
    const tree = transformed('- ![A diagram][Flow]\n\n[flow]: /images/flow.png "The flow"\n');

    expect(all(tree, 'image').map(({ url, title, alt }) => ({ url, title, alt }))).to.deep.equal([
      { url: '/images/flow.png', title: 'The flow', alt: 'A diagram' }
    ]);
    expect(all(tree, 'imageReference')).to.deep.equal([]);
  });

  it('takes the first definition of a label, as CommonMark does', () => {
    const tree = transformed('![a][x]\n\n[x]: /first.png\n[x]: /second.png\n');

    expect(all(tree, 'image').map(({ url }) => url)).to.deep.equal(['/first.png']);
  });

  // A label with no definition is text to the parser already; a link to a defined label stays a link.
  it('leaves an undefined label as text, and a link to a label as a link', () => {
    const tree = transformed('![a][nowhere]\n\n[a link][x]\n\n[x]: /page\n');

    expect(all(tree, 'image')).to.deep.equal([]);
    expect(all(tree, 'text').map((node) => (node as { value?: string }).value)).to.include('![a][nowhere]');
    expect(all(tree, 'linkReference')).to.have.length(1);
  });

  // The CLI reports a missing image before a build that would otherwise fail over it, naming no page.
  it('hands the build exactly the images the CLI checks', async () => {
    const markdown =
      '---\ntitle: Images\n---\n\n![a](/images/a.png)\n\n> ![b][b]\n\n![c][missing]\n\n![d](./d.png)\n\n[b]: /images/b.png\n';
    const checked = (await parsePage(markdown, new FileName('page.md'), 'content/page.md')).images;

    expect(all(transformed(markdown), 'image').map(({ url }) => url)).to.deep.equal(checked.map(({ url }) => url));
  });
});
