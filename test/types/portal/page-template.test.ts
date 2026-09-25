import { expect } from 'chai';
import { FileName } from '../../../src/types/file/fileName';
import { PageTemplate, PageValues } from '../../../src/types/portal/page-template';

describe('PageTemplate', () => {
  const render = (text: string, values: PageValues = {}) =>
    new PageTemplate(new FileName('sdk.mdx'), text).render(values);

  it('fills each placeholder with its value', () => {
    expect(
      render('# {{name}} for {{language}}', { name: 'TypeScript', language: 'typescript' })._unsafeUnwrap()
    ).to.equal('# TypeScript for typescript');
  });

  it('allows whitespace inside the braces', () => {
    expect(render('{{  name }}', { name: 'Go' })._unsafeUnwrap()).to.equal('Go');
  });

  it('leaves a template with no placeholders as it is', () => {
    const text = '---\ntitle: "SDKs"\n---\n\n<Cards>{props.cards}</Cards>\n';

    expect(render(text)._unsafeUnwrap()).to.equal(text);
  });

  // MDX reads its own braces and tags, so escaping would change what the page means.
  it('writes a value exactly as given', () => {
    expect(render('{{name}}', { name: 'C# <SDK> & "$&" more' })._unsafeUnwrap()).to.equal('C# <SDK> & "$&" more');
  });

  it('ignores a value the template does not use', () => {
    expect(render('Hello', { name: 'Go' })._unsafeUnwrap()).to.equal('Hello');
  });

  it('refuses a placeholder the page is not given a value for, naming the template', () => {
    expect(render('{{version}}', { name: 'Go' })._unsafeUnwrapErr()).to.equal(
      "sdk.mdx: '{{version}}' names a value the page is not given."
    );
  });

  describe('sections', () => {
    const cards = [
      { language: 'typescript', name: 'TypeScript' },
      { language: 'python', name: 'Python' }
    ];

    it('repeats a section for each item of a list, dropping the lines its tags stand on', () => {
      const text = '<Cards>\n{{#sdks}}\n<Card language="{{language}}" title="{{name}}" />\n{{/sdks}}\n</Cards>\n';

      expect(render(text, { sdks: cards })._unsafeUnwrap()).to.equal(
        '<Cards>\n<Card language="typescript" title="TypeScript" />\n<Card language="python" title="Python" />\n</Cards>\n'
      );
    });

    it("reads a name inside a section from the item first, then from the page's own values", () => {
      expect(
        render('{{#sdks}}{{name}} for {{site}}; {{/sdks}}', { sdks: cards, site: 'Calc' })._unsafeUnwrap()
      ).to.equal('TypeScript for Calc; Python for Calc; ');
    });

    it('refuses a name inside a section that neither the items nor the page carry', () => {
      expect(render('{{#sdks}}{{version}}{{/sdks}}', { sdks: cards })._unsafeUnwrapErr()).to.equal(
        "sdk.mdx: '{{version}}' names a value the page is not given."
      );
    });

    it('refuses a section the page is not given, and a list written as a placeholder', () => {
      expect(render('{{#sdks}}x{{/sdks}}')._unsafeUnwrapErr()).to.equal(
        "sdk.mdx: '{{#sdks}}' names a value the page is not given."
      );
      expect(render('{{sdks}}', { sdks: cards })._unsafeUnwrapErr()).to.equal(
        "sdk.mdx: '{{sdks}}' names a list, which is written as a section, {{#sdks}}...{{/sdks}}."
      );
    });

    it('shows an inverted section only for an empty value, and a string section only for a non-empty one', () => {
      const text = '{{#source}}[Source]({{source}}){{/source}}{{^source}}No source{{/source}}';

      expect(render(text, { source: 'https://git.test/calc' })._unsafeUnwrap()).to.equal(
        '[Source](https://git.test/calc)'
      );
      expect(render(text, { source: '' })._unsafeUnwrap()).to.equal('No source');
    });

    it('refuses a section that is never closed, naming the template', () => {
      expect(render('{{#sdks}}x', { sdks: cards })._unsafeUnwrapErr()).to.match(/^sdk\.mdx: Unclosed section "sdks"/);
    });
  });

  // Written through, any of these would reach MDX as an expression it cannot parse.
  it('refuses every other form between double braces', () => {
    for (const braces of ['{{{name}}}', '{{&name}}', '{{> header}}', '{{=<% %>=}}', '{{ a.b }}', '{{.}}', '{{}}']) {
      expect(render(braces, { name: 'Go', a: 'y' })._unsafeUnwrapErr(), braces).to.match(
        /is not a placeholder\. A placeholder is \{\{key\}\} and a section \{\{#key\}\}\.\.\.\{\{\/key\}\}/
      );
    }
  });

  it('tells a JSX object apart from a placeholder only by the space between its braces', () => {
    expect(render('<div style={{ color: "red" }} />')._unsafeUnwrapErr()).to.contain(
      "write a JSX object as '{ { ... } }'"
    );
    expect(render('<div style={ { color: "red" } } />').isOk()).to.be.true;
  });
});
