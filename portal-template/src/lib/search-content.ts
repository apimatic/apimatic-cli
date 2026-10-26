import { remark } from 'remark';

/** An mdast node, as far as finding images goes. */
interface MarkdownNode {
  type: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: MarkdownNode[];
}

const IMAGES = new Set(['image', 'imageReference']);

// Without GFM, as the search dialog renders a result.
const markdown = remark();

/** Markdown without its images, as Fumadocs indexes a page of its own, and otherwise as written. */
export function withoutImages(text: string): string {
  let kept = '';
  let from = 0;
  for (const { position } of imagesIn(markdown.parse(text))) {
    kept += text.slice(from, position?.start.offset ?? from);
    from = position?.end.offset ?? from;
  }
  return kept + text.slice(from);
}

function imagesIn(node: MarkdownNode): MarkdownNode[] {
  return IMAGES.has(node.type) ? [node] : (node.children ?? []).flatMap(imagesIn);
}
