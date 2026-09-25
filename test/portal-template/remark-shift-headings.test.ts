import { expect } from 'chai';
import { MarkdownNode, remarkShiftHeadings } from '../../portal-template/src/lib/remark-shift-headings';

describe('remarkShiftHeadings', () => {
  const heading = (depth: number): MarkdownNode => ({ type: 'heading', depth, children: [] });
  const wrapped = (...children: MarkdownNode[]): MarkdownNode => ({
    type: 'mdxJsxFlowElement',
    name: 'ShiftHeadings',
    children
  });

  const shifted = (...children: MarkdownNode[]): MarkdownNode[] => {
    const tree: MarkdownNode = { type: 'root', children };
    remarkShiftHeadings()(tree);
    return tree.children ?? [];
  };
  const depths = (nodes: MarkdownNode[]) => nodes.map((node) => `${node.type}:${node.depth ?? '-'}`);

  it('shifts the headings it wraps so the shallowest is H2, keeping their steps, and drops itself', () => {
    expect(depths(shifted(wrapped(heading(1), { type: 'paragraph' }, heading(2), heading(3))))).to.deep.equal([
      'heading:2',
      'paragraph:-',
      'heading:3',
      'heading:4'
    ]);
  });

  it('leaves Markdown that already starts at H2, or has no headings, as it is', () => {
    expect(depths(shifted(wrapped(heading(2), heading(4))))).to.deep.equal(['heading:2', 'heading:4']);
    expect(depths(shifted(wrapped({ type: 'paragraph' })))).to.deep.equal(['paragraph:-']);
  });

  it('stops at H6', () => {
    expect(depths(shifted(wrapped(heading(1), heading(6))))).to.deep.equal(['heading:2', 'heading:6']);
  });

  // The SDK docs and the plugin page are the backend's and ours, and keep their levels.
  it('touches nothing outside the wrapper', () => {
    expect(depths(shifted(heading(1), wrapped(heading(1)), heading(3)))).to.deep.equal([
      'heading:1',
      'heading:2',
      'heading:3'
    ]);
  });

  it('finds a wrapper wherever it stands, and headings wherever they stand inside it', () => {
    const list: MarkdownNode = { type: 'listItem', children: [heading(1)] };
    const [section] = shifted({ type: 'section', children: [wrapped(list)] });

    expect(section.children?.[0].children?.[0].depth).to.equal(2);
  });
});
