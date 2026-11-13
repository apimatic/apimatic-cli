/**
 * The language of the code block whose copy button a click hit: a titled block's caption, or the selected tab's
 * name when the block is one of a tabbed set. Null for a block with neither, and for any other click.
 */
export function copiedLanguage(target: EventTarget | null): string | null {
  const button = target !== null && 'closest' in target ? (target as Element).closest('figure button') : null;
  if (button === null) return null;
  // Not a copy: a dropdown in a block's header, the playground's dialog, or a block that reports its own copy.
  if (button.matches('[role="combobox"]') || button.matches('[aria-haspopup]')) return null;
  if (button.closest('[role="dialog"]') !== null || button.closest('[data-copy-reported]') !== null) return null;
  const figure = button.closest('figure');
  const caption = figure?.querySelector('figcaption')?.textContent?.trim();
  if (caption) return caption;
  const tabs = figure?.closest('[role="tabpanel"]')?.parentElement;
  return tabs?.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() || null;
}
