export async function copyMarkdown(rootRelativeUrl: string, base: string): Promise<void> {
  const url = `${base.replace(/\/$/, '')}${rootRelativeUrl}`;
  // Handed over unresolved, so Safari still counts the write as part of the click.
  const markdown = fetchMarkdown(url);
  await Promise.all([navigator.clipboard.write([new ClipboardItem({ 'text/plain': markdown })]), markdown]);
}

async function fetchMarkdown(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}
