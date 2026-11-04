import path from 'node:path';

/** An mdast node, as far as an `<img>` written in an `.mdx` page and the import added for its file go. */
interface MarkdownNode {
  type: string;
  name?: string | null;
  attributes?: JsxAttribute[];
  value?: unknown;
  data?: unknown;
  children?: MarkdownNode[];
}

interface JsxAttribute {
  type: string;
  name?: string;
  value?: unknown;
}

// A scheme, a drive letter or a network path: none of them names a file the build imports.
const NOT_A_FILE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

const estreeProgram = (statement: object) => ({ type: 'Program', sourceType: 'module', body: [statement] });

/** Bundles the file an `<img>` names, as `remarkImage` does for Markdown images alone. page.ts checks the same. */
export function remarkJsxImages({ publicDir }: { publicDir: string | false }) {
  return (tree: MarkdownNode, { dirname }: { dirname?: string }) => {
    if (dirname === undefined) return;
    const imports: MarkdownNode[] = [];
    for (const { attribute, address } of imageSources(tree)) {
      const file = fileOf(address, publicDir, dirname);
      if (file === null) continue;
      // As `remarkImage` writes it, so a file on another drive is `./C:/…`, which static-images.ts resolves.
      const relative = path.relative(dirname, file).replaceAll(path.sep, '/');
      const name = `__jsxImg${imports.length}`;
      imports.push(importOf(name, relative.startsWith('../') ? relative : `./${relative}`));
      attribute.value = expressionOf(name);
    }
    tree.children?.unshift(...imports);
  };
}

function* imageSources(node: MarkdownNode): Generator<{ attribute: JsxAttribute; address: string }> {
  if ((node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && node.name === 'img') {
    const src = node.attributes?.find(({ type, name }) => type === 'mdxJsxAttribute' && name === 'src');
    // A browser drops the spaces around an `<img>`'s address; `remarkImage` keeps a Markdown image's.
    if (typeof src?.value === 'string') yield { attribute: src, address: src.value.trim() };
  }
  for (const child of node.children ?? []) yield* imageSources(child);
}

function fileOf(url: string, publicDir: string | false, dirname: string): string | null {
  const address = url.split(/[?#]/, 1)[0];
  if (address.length === 0 || address.endsWith('/') || NOT_A_FILE.test(address)) return null;
  const decoded = decodedAddress(address);
  if (!decoded.startsWith('/')) return path.join(dirname, decoded);
  return publicDir === false ? null : path.join(publicDir, decoded);
}

function decodedAddress(address: string): string {
  try {
    return decodeURI(address);
  } catch {
    return address;
  }
}

function importOf(name: string, source: string): MarkdownNode {
  return {
    type: 'mdxjsEsm',
    value: `import ${name} from ${JSON.stringify(source)}`,
    data: {
      estree: estreeProgram({
        type: 'ImportDeclaration',
        source: { type: 'Literal', value: source },
        specifiers: [{ type: 'ImportDefaultSpecifier', local: { type: 'Identifier', name } }]
      })
    }
  };
}

function expressionOf(name: string): MarkdownNode {
  return {
    type: 'mdxJsxAttributeValueExpression',
    value: name,
    data: { estree: estreeProgram({ type: 'ExpressionStatement', expression: { type: 'Identifier', name } }) }
  };
}
