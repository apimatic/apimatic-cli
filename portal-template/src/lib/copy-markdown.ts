const cache = new Map<string, string>();

/**
 * Puts a page's Markdown on the clipboard; rejects when it cannot be fetched or written.
 * `markdownUrl` is root-relative, starting with `/`, as `getPageMarkdownUrl` builds it:
 * it is appended to `base` as is.
 */
export async function copyMarkdown(markdownUrl: string, base: string): Promise<void> {
  const url = `${base.replace(/\/$/, '')}${markdownUrl}`;
  const cached = cache.get(url);
  if (cached !== undefined) return navigator.clipboard.writeText(cached);
  // Handed over unresolved, so Safari still counts the write as part of the click.
  await navigator.clipboard.write([new ClipboardItem({ 'text/plain': fetchMarkdown(url) })]);
}

async function fetchMarkdown(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const markdown = await response.text();
  cache.set(url, markdown);
  return markdown;
}
