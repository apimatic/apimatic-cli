/** As much of an mdast node as the shift reads. */
export interface MarkdownNode {
  type: string;
  name?: string | null;
  depth?: number;
  children?: MarkdownNode[];
}

/** The element a generated page wraps included Markdown in to have its headings shifted. */
const WRAPPER = 'ShiftHeadings';

function headingsIn(node: MarkdownNode): MarkdownNode[] {
  return [...(node.type === 'heading' ? [node] : []), ...(node.children ?? []).flatMap(headingsIn)];
}

// Code is its own node by now, so a `# comment` in a fence is never taken for a heading.
function shiftToSecondLevel(node: MarkdownNode): void {
  const headings = headingsIn(node);
  const shift = 2 - Math.min(...headings.map((heading) => heading.depth ?? 2));
  if (shift <= 0) return;
  for (const heading of headings) heading.depth = Math.min(6, (heading.depth ?? 2) + shift);
}

function unwrap(node: MarkdownNode): void {
  if (!node.children) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'mdxJsxFlowElement' && child.name === WRAPPER) {
      shiftToSecondLevel(child);
      return child.children ?? [];
    }
    unwrap(child);
    return [child];
  });
}

/**
 * Shifts the headings inside each `<ShiftHeadings>` so the shallowest is H2, under the page's own
 * title, then drops the wrapper so it renders as nothing. Registered after the includes are
 * inlined and before the headings are collected for the table of contents. A spec's description
 * is the user's Markdown, which often opens with an H1.
 */
export function remarkShiftHeadings() {
  return (tree: MarkdownNode) => unwrap(tree);
}
