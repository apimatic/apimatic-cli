import { expect } from 'chai';
import { FileName } from '../../../src/types/file/fileName';
import { PageTemplate } from '../../../src/types/portal/page-template';

describe('PageTemplate', () => {
  const render = (text: string, data: Record<string, string> = {}) =>
    new PageTemplate(new FileName('sdk.mdx'), text).render(data);

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

  // MDX reads its own braces, so escaping would change what the page means.
  it('writes a value exactly as given', () => {
    expect(render('{{name}}', { name: 'C# <SDK> & $& more' })._unsafeUnwrap()).to.equal('C# <SDK> & $& more');
  });

  it('ignores a value the template does not use', () => {
    expect(render('Hello', { name: 'Go' })._unsafeUnwrap()).to.equal('Hello');
  });

  it('refuses a placeholder the page is not given a value for, naming the template', () => {
    expect(render('{{version}}', { name: 'Go' })._unsafeUnwrapErr()).to.equal(
      "sdk.mdx: '{{version}}' names a value the page is not given."
    );
  });

  // Written through, a section would reach MDX as an expression it cannot parse.
  it('refuses any other form between double braces', () => {
    for (const braces of ['{{#languages}}', '{{{name}}}', '{{ a.b }}', '{{}}']) {
      expect(render(braces, { name: 'Go', languages: 'x', a: 'y' })._unsafeUnwrapErr(), braces).to.match(
        /is not a placeholder\. A placeholder is \{\{key\}\}/
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
