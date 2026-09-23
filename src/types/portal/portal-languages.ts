import { err, ok, Result } from 'neverthrow';
import { ConfigFinding, findingSentences } from '../apimatic-config/document.js';
import { Language } from '../sdk/generate.js';
import { isJsonObject } from './config/fields.js';

const KNOWN_LANGUAGES: readonly string[] = Object.values(Language);

// Written out in full so the one-line fix is in the message: nothing in the portal's own
// commands writes this block yet.
const REQUIRED =
  `'languages' must name at least one SDK language, for example "languages": { "typescript": {} }. ` +
  `It is the project's one list of SDK languages, which the plugin commands read too, and ` +
  `'apimatic sdk publish' adds to it.`;

/**
 * The SDK languages the portal documents, read from the top-level `languages` block the
 * plugin commands share. An entry without a `publishing` record counts: it is a language the
 * project wants and has not published yet.
 */
export class PortalLanguages {
  private constructor(
    private readonly languages: readonly Language[],
    private readonly published: ReadonlySet<Language>
  ) {}

  /**
   * `block` is the block when it is an object, and `findings` what the document found wrong
   * with it, which already covers a block or an entry of the wrong shape.
   */
  public static fromBlock(
    block: Record<string, unknown> | undefined,
    findings: readonly ConfigFinding[]
  ): Result<PortalLanguages, string[]> {
    const errors = findingSentences(findings);
    const keys = Object.keys(block ?? {});
    if (keys.length === 0 && findings.length === 0) {
      errors.push(REQUIRED);
    }
    for (const key of keys.filter((key) => !KNOWN_LANGUAGES.includes(key))) {
      errors.push(
        `'languages.${key}' is not an SDK language; name one of ${KNOWN_LANGUAGES.map((known) => `'${known}'`).join(
          ', '
        )}.`
      );
    }
    if (errors.length > 0) {
      return err(errors);
    }

    const languages = keys as Language[];
    const published = languages.filter((language) => PortalLanguages.isPublished(block?.[language]));
    return ok(new PortalLanguages(languages, new Set(published)));
  }

  /** In the order the block lists them. */
  public all(): Language[] {
    return [...this.languages];
  }

  public isPublished(language: Language): boolean {
    return this.published.has(language);
  }

  // The same test `PluginConfigPresent.hasPublishedSdks` applies: a record naming neither where
  // the source lives nor which package carries it has published nothing a reader could use.
  private static isPublished(entry: unknown): boolean {
    const publishing = isJsonObject(entry) ? entry.publishing : undefined;
    return isJsonObject(publishing) && (Boolean(publishing.source) || Boolean(publishing.package));
  }
}
