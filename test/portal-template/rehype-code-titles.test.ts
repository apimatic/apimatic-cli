import { expect } from 'chai';
import rehypeRaw from 'rehype-raw';
import { rehypeCodeTitles, rehypeKeepCodeMeta } from '../../portal-template/src/lib/rehype-code-titles';

describe('the code block titles of the generated pages', () => {
  interface Node {
    type: string;
    tagName?: string;
    name?: string;
    value?: string;
    properties?: { className?: string[]; metastring?: string };
    data?: { meta?: string | null };
    children?: Node[];
  }

  /** A fenced block as `remark-rehype` hands it on, with its info string's language and meta. */
  const fence = (language: string | null, meta: string | null = null): Node => ({
    type: 'element',
    tagName: 'pre',
    properties: {},
    children: [
      {
        type: 'element',
        tagName: 'code',
        properties: { className: language === null ? [] : [`language-${language}`] },
        data: { meta },
        children: [{ type: 'text', value: 'npm install calc' }]
      }
    ]
  });

  const codeIn = (node: Node): Node | undefined =>
    node.tagName === 'code' ? node : node.children?.map(codeIn).find((code) => code !== undefined);

  /** The meta `rehypeCode` reads, once the steps have run around `rehype-raw` as the collection runs them. */
  const titled = (block: Node): string | null => {
    const page: Node = { type: 'root', children: [block] };
    rehypeKeepCodeMeta()(page);
    const raw = rehypeRaw({ passThrough: ['mdxJsxFlowElement'] })(page as never, { path: 'page.md' } as never) as Node;
    rehypeCodeTitles()(raw);
    const code = codeIn(raw);
    return code?.data?.meta ?? code?.properties?.metastring ?? null;
  };

  const tabbed = (block: Node, name = 'CodeBlockTab'): Node => ({ type: 'mdxJsxFlowElement', name, children: [block] });

  it('titles a block after its language, by any name the highlighter knows it by', () => {
    expect(titled(fence('typescript'))).to.equal('title="TypeScript"');
    expect(titled(fence('ts'))).to.equal('title="TypeScript"');
    expect(titled(fence('csharp'))).to.equal('title="C#"');
  });

  it('names a shell for where its command runs', () => {
    expect(titled(fence('bash'))).to.equal('title="Terminal"');
    expect(titled(fence('console'))).to.equal('title="Terminal"');
  });

  // `rehype-raw` drops the meta `remark-rehype` sets, which would lose what the author wrote.
  it('keeps a title its author gave, and the rest of its meta beside the one it adds', () => {
    expect(titled(fence('ts', 'title="client.ts"'))).to.equal('title="client.ts"');
    expect(titled(fence('ts', 'lineNumbers'))).to.equal('lineNumbers title="TypeScript"');
    expect(titled(fence('rust', 'noCopy'))).to.equal('noCopy');
  });

  // `rehypeCode` shows no title for one it cannot read, so the block would otherwise go unheaded.
  it('titles a block whose own title is not quoted', () => {
    expect(titled(fence('ts', 'title=client.ts'))).to.equal('title=client.ts title="TypeScript"');
  });

  // The titles cover the grammars the portal ships; a page in any other language keeps its blocks as written.
  it('leaves a block untitled when its language is not one the portal names, or it names none', () => {
    expect(titled(fence('rust'))).to.be.null;
    expect(titled(fence('constructor'))).to.be.null;
    expect(titled(fence(null))).to.be.null;
  });

  it('leaves a tabbed block to the tab that names it, keeping its meta', () => {
    expect(titled(tabbed(fence('ts')))).to.be.null;
    expect(titled(tabbed(fence('ts', 'lineNumbers')))).to.equal('lineNumbers');
    expect(titled(tabbed(fence('ts'), 'Tab'))).to.be.null;
    expect(titled(tabbed(fence('ts'), 'TabsContent'))).to.be.null;
  });

  // The SDK docs may write a block as HTML, which is an element only once `rehype-raw` has run.
  it('titles a block written as HTML', () => {
    expect(titled({ type: 'raw', value: '<pre><code class="language-bash">npm install calc</code></pre>' })).to.equal(
      'title="Terminal"'
    );
  });
});
