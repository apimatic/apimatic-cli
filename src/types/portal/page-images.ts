import { frontmatter } from 'fumadocs-core/content/md/frontmatter';

/** A Markdown image the build imports, where it looks for the file, and the path it looks up there. */
export interface PageImage {
  /** As the page writes it. */
  url: string;
  line: number;
  /** An image written as `/…` is read from the static directory, any other from beside its page. */
  from: 'static' | 'page';
  /** Decoded, without its query or fragment, with `/` between segments. */
  path: string;
}

interface MarkdownNode {
  type: string;
  url?: string;
  position?: { start: { line: number } };
  children?: MarkdownNode[];
}

// A scheme, a drive letter or a network path: none of them names a file the build imports.
const NOT_A_FILE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

/** Parsed as the build parses it, `.mdx` as MDX; a page that does not parse is the other checks' or the build's to report. */
export async function pageImages(contents: string, isMdx: boolean): Promise<PageImage[]> {
  // On first use, as the front matter schema is: most commands never read a page.
  const { remark } = await import('remark');
  const processor = isMdx ? remark().use((await import('remark-mdx')).default) : remark();
  let tree: MarkdownNode;
  try {
    tree = processor.parse(withoutFrontMatter(contents)) as MarkdownNode;
  } catch {
    return [];
  }

  const images: PageImage[] = [];
  const visit = (node: MarkdownNode) => {
    const image = node.type === 'image' && node.url !== undefined ? located(node.url) : null;
    if (image !== null) {
      images.push({ ...image, line: node.position?.start.line ?? 0 });
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  return images;
}

// Blanked rather than cut, so every line keeps its number.
function withoutFrontMatter(contents: string): string {
  const { matter } = frontmatter(contents);
  return '\n'.repeat(matter.split('\n').length - 1) + contents.slice(matter.length);
}

function located(url: string): Omit<PageImage, 'line'> | null {
  const address = url.split(/[?#]/, 1)[0];
  if (address.length === 0 || address.endsWith('/') || NOT_A_FILE.test(address)) {
    return null;
  }
  const path = decodedAddress(address);
  return path.startsWith('/') ? { url, from: 'static', path: path.replace(/^\/+/, '') } : { url, from: 'page', path };
}

function decodedAddress(address: string): string {
  try {
    return decodeURI(address);
  } catch {
    return address;
  }
}
