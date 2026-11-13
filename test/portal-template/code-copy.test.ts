import { expect } from 'chai';
import { copiedLanguage } from '../../portal-template/src/lib/code-copy';

/** As much of an element as the copy reader walks: the selectors it matches, its text, and its place in the tree. */
class FakeElement {
  public parentElement: FakeElement | null = null;

  public constructor(
    private readonly selectors: string[],
    public readonly textContent: string | null = null,
    private readonly children: FakeElement[] = []
  ) {
    for (const child of children) child.parentElement = this;
  }

  public matches(selector: string): boolean {
    return this.selectors.includes(selector);
  }

  public closest(selector: string): FakeElement | null {
    return this.selectors.includes(selector) ? this : this.parentElement?.closest(selector) ?? null;
  }

  public querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      const found = child.selectors.includes(selector) ? child : child.querySelector(selector);
      if (found !== null) return found;
    }
    return null;
  }
}

const element = (fake: FakeElement) => fake as unknown as Parameters<typeof copiedLanguage>[0];

/** Fumadocs' code block: a figure with the copy button in its header beside the caption, or in its corner when untitled. */
function codeBlock(title: string | null) {
  const button = new FakeElement(['figure button']);
  const caption = title === null ? [] : [new FakeElement(['figcaption'], title)];
  const figure = new FakeElement(['figure'], null, [new FakeElement([], null, [...caption, button])]);
  return { figure, button };
}

/** A tabbed set of untitled blocks under one root, with `selected` shown: the copy button of the block that is. */
function tabbedBlocks(names: string[], selected: string): FakeElement {
  const tabs = names.map(
    (name) =>
      new FakeElement(
        name === selected ? ['[role="tab"]', '[role="tab"][aria-selected="true"]'] : ['[role="tab"]'],
        name
      )
  );
  const blocks = names.map(() => codeBlock(null));
  const panels = blocks.map(({ figure }) => new FakeElement(['[role="tabpanel"]'], null, [figure]));
  new FakeElement([], null, [new FakeElement(['[role="tablist"]'], null, tabs), ...panels]);
  return blocks[names.indexOf(selected)].button;
}

describe('copiedLanguage', () => {
  it('reads a titled block’s caption', () => {
    expect(copiedLanguage(element(codeBlock('TypeScript').button))).to.equal('TypeScript');
  });

  it('reads the selected tab’s name for a block in a tabbed set', () => {
    expect(copiedLanguage(element(tabbedBlocks(['cURL', 'TypeScript'], 'TypeScript')))).to.equal('TypeScript');
    expect(copiedLanguage(element(tabbedBlocks(['cURL', 'TypeScript'], 'cURL')))).to.equal('cURL');
  });

  it('prefers the caption of a titled block inside a tabbed set', () => {
    const { figure, button } = codeBlock('Terminal');
    const tab = new FakeElement(['[role="tab"]', '[role="tab"][aria-selected="true"]'], 'macOS');
    new FakeElement([], null, [
      new FakeElement(['[role="tablist"]'], null, [tab]),
      new FakeElement(['[role="tabpanel"]'], null, [figure])
    ]);

    expect(copiedLanguage(element(button))).to.equal('Terminal');
  });

  it('is null for a block with neither, for a click outside any block, and for a click with no target', () => {
    expect(copiedLanguage(element(codeBlock(null).button))).to.be.null;
    expect(copiedLanguage(element(new FakeElement(['button'])))).to.be.null;
    expect(copiedLanguage(null)).to.be.null;
  });

  it('is null in a block that reports its own copy', () => {
    const own = codeBlock('Terminal');
    // The install command's wrapper marks its block.
    new FakeElement(['[data-copy-reported]'], null, [own.figure]);

    expect(copiedLanguage(element(own.button))).to.be.null;
  });

  it('is null for a dropdown in a block’s header, and for anything in the playground’s dialog', () => {
    const dropdown = new FakeElement(['figure button', '[role="combobox"]']);
    new FakeElement(['figure'], null, [
      new FakeElement([], null, [new FakeElement(['figcaption'], 'Request'), dropdown])
    ]);
    const menu = new FakeElement(['figure button', '[aria-haspopup]']);
    new FakeElement(['figure'], null, [new FakeElement(['figcaption'], 'JSON'), menu]);
    const inDialog = codeBlock('Body');
    new FakeElement(['[role="dialog"]'], null, [inDialog.figure]);

    expect(copiedLanguage(element(dropdown))).to.be.null;
    expect(copiedLanguage(element(menu))).to.be.null;
    expect(copiedLanguage(element(inDialog.button))).to.be.null;
  });
});
