/** Puts a page's Markdown on the clipboard; rejects when it cannot be fetched or written. */
export async function copyMarkdown(markdownUrl: string, base: string): Promise<void> {
  const url = `${base.replace(/\/$/, '')}${markdownUrl}`;
  // Handed over unresolved, so Safari still counts the write as part of the click.
  await navigator.clipboard.write([new ClipboardItem({ 'text/plain': fetchMarkdown(url) })]);
}

async function fetchMarkdown(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}
