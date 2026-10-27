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

const program = (statement: object) => ({ type: 'Program', sourceType: 'module', body: [statement] });

/** Bundles the file an `<img>` names, as `remarkImage` does for Markdown images alone. page.ts checks the same. */
export function remarkJsxImages({ publicDir }: { publicDir: string | false }) {
  return (tree: MarkdownNode, { dirname }: { dirname?: string }) => {
    if (dirname === undefined) return;
    const imports: MarkdownNode[] = [];
    for (const [src, address] of imageSources(tree)) {
      const file = fileOf(address, publicDir, dirname);
      if (file === null) continue;
      const name = `__jsxImg${imports.length}`;
      // As `remarkImage` writes it, so a file on another drive is `./C:/…`, which static-images.ts resolves.
      const relative = path.relative(dirname, file).replaceAll(path.sep, '/');
      const source = relative.startsWith('../') ? relative : `./${relative}`;
      imports.push({
        type: 'mdxjsEsm',
        value: `import ${name} from ${JSON.stringify(source)}`,
        data: {
          estree: program({
            type: 'ImportDeclaration',
            source: { type: 'Literal', value: source },
            specifiers: [{ type: 'ImportDefaultSpecifier', local: { type: 'Identifier', name } }]
          })
        }
      });
      src.value = {
        type: 'mdxJsxAttributeValueExpression',
        value: name,
        data: { estree: program({ type: 'ExpressionStatement', expression: { type: 'Identifier', name } }) }
      };
    }
    tree.children?.unshift(...imports);
  };
}

function* imageSources(node: MarkdownNode): Generator<[JsxAttribute, string]> {
  if ((node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && node.name === 'img') {
    const src = node.attributes?.find(({ type, name }) => type === 'mdxJsxAttribute' && name === 'src');
    if (typeof src?.value === 'string') yield [src, src.value];
  }
  for (const child of node.children ?? []) yield* imageSources(child);
}

function fileOf(address: string, publicDir: string | false, dirname: string): string | null {
  // A browser drops the spaces around an address.
  const written = address.trim().split(/[?#]/, 1)[0];
  if (written.length === 0 || written.endsWith('/') || NOT_A_FILE.test(written)) return null;
  const decoded = decodedAddress(written);
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
