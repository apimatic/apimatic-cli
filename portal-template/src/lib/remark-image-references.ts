/** An mdast node, as far as images and the definitions they refer to go. */
interface MarkdownNode {
  type: string;
  identifier?: string;
  url?: string;
  title?: string | null;
  alt?: string | null;
  position?: unknown;
  children?: MarkdownNode[];
}

/** Writes `![alt][ref]` as `![alt](url)`, the only form Fumadocs' `remarkImage` imports. page.ts checks the same. */
export function remarkImageReferences() {
  return (tree: MarkdownNode) => {
    const definitions = new Map<string, MarkdownNode>();
    const define = (node: MarkdownNode) => {
      // The first definition of a label wins, as CommonMark reads them.
      if (node.type === 'definition' && node.identifier !== undefined && !definitions.has(node.identifier)) {
        definitions.set(node.identifier, node);
      }
      node.children?.forEach(define);
    };
    define(tree);

    const inline = (node: MarkdownNode): MarkdownNode => {
      const definition = node.type === 'imageReference' ? definitions.get(node.identifier ?? '') : undefined;
      if (definition !== undefined) {
        return { type: 'image', url: definition.url, title: definition.title, alt: node.alt, position: node.position };
      }
      if (node.children !== undefined) node.children = node.children.map(inline);
      return node;
    };
    inline(tree);
  };
}
