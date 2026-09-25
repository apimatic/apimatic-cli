import { frontmatter } from 'fumadocs-core/content/md/frontmatter';
import { err, ok, Result } from 'neverthrow';
import { errorMessage } from '../../utils/error-utils.js';
import { isJsonObject } from '../../utils/json-utils.js';

/** The optional fields of the build's page schema, `pageSchema` in `fumadocs-core/source/schema`. */
export const OPTIONAL_PAGE_FIELDS = { description: 'string', icon: 'string', full: 'boolean' } as const;

const EXPECTED = { string: 'text', boolean: 'true or false' } as const;

/** Read by the build's own parser and held to its schema, which fails the whole build over one page. */
export class PageFrontMatter {
  /** The page's title, as the sidebar and a tab are named by it. */
  public static title(markdown: string, label: string): Result<string, string[]> {
    let matter: string;
    let data: unknown;
    try {
      ({ matter, data } = frontmatter(markdown));
    } catch (error) {
      return err([`${label}: its front matter is not valid YAML. ${errorMessage(error).split('\n')[0]}`]);
    }
    if (matter.length === 0) {
      return err([`${label} has no front matter, which is where its title goes.`]);
    }

    const fields = isJsonObject(data) ? data : {};
    const errors = [
      ...PageFrontMatter.titleErrors(fields.title, label),
      ...Object.entries(OPTIONAL_PAGE_FIELDS).flatMap(([field, type]) =>
        fields[field] === undefined || typeof fields[field] === type
          ? []
          : [`${label}: '${field}' must be ${EXPECTED[type]}.`]
      )
    ];
    return errors.length > 0 ? err(errors) : ok(fields.title as string);
  }

  private static titleErrors(title: unknown, label: string): string[] {
    if (title === undefined) {
      return [`${label} has no 'title' in its front matter.`];
    }
    // The build takes an empty string, and the page is then a blank entry in the sidebar.
    if (title === null || (typeof title === 'string' && title.trim().length === 0)) {
      return [`${label}: 'title' must not be empty.`];
    }
    if (typeof title !== 'string') {
      return [`${label}: 'title' must be text. Put it in quotes if it looks like a number or true or false.`];
    }
    return [];
  }
}
