import { frontmatter } from 'fumadocs-core/content/md/frontmatter';
import type { pageSchema } from 'fumadocs-core/source/schema';
import { err, ok, Result } from 'neverthrow';
import { errorMessage } from '../../utils/error-utils.js';
import { isJsonObject } from '../../utils/json-utils.js';
import { FileName } from '../file/fileName.js';

/** What the build reads from a page's front matter that the CLI needs. */
export interface PageFrontMatter {
  /** What the sidebar and a tab name the page by. */
  title: string;
}

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

/** A page as the build parses it: its front matter held to the build's schema, and the images the build imports. */
export interface ParsedPage {
  frontMatter: Result<PageFrontMatter, string[]>;
  images: PageImage[];
}

type SchemaIssue = NonNullable<ReturnType<typeof pageSchema.safeParse>['error']>['issues'][number];

const EXPECTED: Partial<Record<string, string>> = { string: 'text', boolean: 'true or false' };

interface MarkdownNode {
  type: string;
  url?: string;
  position?: { start: { line: number } };
  children?: MarkdownNode[];
}

// A scheme, a drive letter or a network path: none of them names a file the build imports.
const NOT_A_FILE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

/** Parsed once, as the build parses it, `.mdx` as MDX; a body that does not parse is the build's to report. */
export async function parsePage(contents: string, fileName: FileName, label: string): Promise<ParsedPage> {
  let parsed: { matter: string; data: unknown };
  try {
    parsed = frontmatter(contents);
  } catch (error) {
    const reason = errorMessage(error).split('\n')[0];
    return { frontMatter: err([`${label}: its front matter is not valid YAML. ${reason}`]), images: [] };
  }
  // Blanked rather than cut, so every line keeps its number.
  const body = '\n'.repeat(parsed.matter.split('\n').length - 1) + contents.slice(parsed.matter.length);
  return {
    frontMatter: await checkedFrontMatter(parsed, label),
    images: await imagesIn(body, fileName.hasExactExtension('.mdx'))
  };
}

/** Held to the build's own schema, which fails the whole build over one page. */
async function checkedFrontMatter(
  { matter, data }: { matter: string; data: unknown },
  label: string
): Promise<Result<PageFrontMatter, string[]>> {
  if (matter.length === 0) {
    return err([`${label} has no front matter, which is where its title goes.`]);
  }

  // On first use: zod, which the schema is written in, adds a tenth of a second to every command's start.
  const { pageSchema: schema } = await import('fumadocs-core/source/schema');
  const fields = isJsonObject(data) ? data : {};
  const checked = schema.safeParse(fields);
  if (!checked.success) {
    return err(checked.error.issues.map((issue) => describeIssue(issue, fields, label)));
  }
  // The schema takes an empty title, and the page is then a blank entry in the sidebar.
  if (checked.data.title.trim().length === 0) {
    return err([`${label}: 'title' must not be empty.`]);
  }
  return ok({ title: checked.data.title });
}

function describeIssue(issue: SchemaIssue, fields: Record<string, unknown>, label: string): string {
  const field = issue.path.join('.');
  if (field === 'title') {
    return titleError(fields.title, label);
  }
  const expected = issue.code === 'invalid_type' ? EXPECTED[issue.expected] : undefined;
  return expected === undefined
    ? `${label}: '${field}': ${issue.message}.`
    : `${label}: '${field}' must be ${expected}.`;
}

function titleError(title: unknown, label: string): string {
  if (title === undefined) {
    return `${label} has no 'title' in its front matter.`;
  }
  if (title === null) {
    return `${label}: 'title' must not be empty.`;
  }
  return `${label}: 'title' must be text. Put it in quotes if it looks like a number or true or false.`;
}

async function imagesIn(body: string, isMdx: boolean): Promise<PageImage[]> {
  // On first use, as the schema is: most commands never read a page.
  const { remark } = await import('remark');
  const processor = isMdx ? remark().use((await import('remark-mdx')).default) : remark();
  let tree: MarkdownNode;
  try {
    tree = processor.parse(body) as MarkdownNode;
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
