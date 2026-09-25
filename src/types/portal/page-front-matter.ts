import { frontmatter } from 'fumadocs-core/content/md/frontmatter';
import type { pageSchema } from 'fumadocs-core/source/schema';
import { err, ok, Result } from 'neverthrow';
import { errorMessage } from '../../utils/error-utils.js';
import { isJsonObject } from '../../utils/json-utils.js';

/** What the build reads from a page's front matter that the CLI needs. */
export interface PageFrontMatter {
  /** What the sidebar and a tab name the page by. */
  title: string;
}

type SchemaIssue = NonNullable<ReturnType<typeof pageSchema.safeParse>['error']>['issues'][number];

const EXPECTED: Partial<Record<string, string>> = { string: 'text', boolean: 'true or false' };

/** Read by the build's own parser and held to its own schema, which fails the whole build over one page. */
export async function parsePageFrontMatter(
  markdown: string,
  label: string
): Promise<Result<PageFrontMatter, string[]>> {
  let parsed: { matter: string; data: unknown };
  try {
    parsed = frontmatter(markdown);
  } catch (error) {
    return err([`${label}: its front matter is not valid YAML. ${errorMessage(error).split('\n')[0]}`]);
  }
  if (parsed.matter.length === 0) {
    return err([`${label} has no front matter, which is where its title goes.`]);
  }

  // On first use: zod, which the schema is written in, adds a tenth of a second to every command's start.
  const { pageSchema: schema } = await import('fumadocs-core/source/schema');
  const fields = isJsonObject(parsed.data) ? parsed.data : {};
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
