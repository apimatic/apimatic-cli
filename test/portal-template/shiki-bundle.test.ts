import { expect } from 'chai';
import { createHighlighter } from '../../portal-template/src/lib/shiki-bundle';

/**
 * The trimmed bundle stands in for Shiki's entry point, so it is the whole of what the portal
 * can highlight. Driven directly rather than through a build, because `x-codeSamples` are
 * highlighted in the browser, where no assertion on the prerendered HTML reaches them.
 */
describe('the trimmed Shiki bundle', function () {
  this.timeout(60_000);

  const highlight = async (lang: string): Promise<string> => {
    const highlighter = await createHighlighter({ langs: [lang], themes: ['github-light'] });
    try {
      return highlighter.codeToHtml('const total = add(1, 2);', { lang, theme: 'github-light' });
    } finally {
      highlighter.dispose();
    }
  };

  /** A highlighted block carries a colour per token kind; plain text comes back as one. */
  const tokenColours = (html: string): number =>
    new Set([...html.matchAll(/color:\s*(#[0-9a-fA-F]{3,8})/g)].map((match) => match[1].toLowerCase())).size;

  const canonical = ['typescript', 'javascript', 'python', 'shellscript', 'csharp'];
  const aliases = ['ts', 'js', 'py', 'sh', 'cs'];

  canonical.forEach((lang) => {
    it(`highlights ${lang}`, async () => {
      expect(tokenColours(await highlight(lang))).to.be.greaterThan(1);
    });
  });

  aliases.forEach((lang) => {
    it(`highlights the alias ${lang}`, async () => {
      expect(tokenColours(await highlight(lang))).to.be.greaterThan(1);
    });
  });

  it('refuses a language it does not bundle, rather than pretending to know it', async () => {
    let refused = false;
    try {
      await highlight('fortran');
    } catch {
      refused = true;
    }

    expect(refused, 'expected an unbundled language to be refused').to.be.true;
  });
});
