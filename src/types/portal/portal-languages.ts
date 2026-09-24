import { err, ok, Result } from 'neverthrow';
import { ConfigFinding, findingSentences } from '../apimatic-config/document.js';
import { Language } from '../sdk/generate.js';
import { quotedList } from './config/fields.js';

const KNOWN_LANGUAGES: readonly string[] = Object.values(Language);

export const LANGUAGES_EXAMPLE = '"languages": { "typescript": {} }';

// Written out in full so the one-line fix is in the message: nothing in the portal's own
// commands writes this block yet.
const REQUIRED =
  `'languages' must name at least one SDK language, for example ${LANGUAGES_EXAMPLE}. ` +
  `It is the project's one list of SDK languages, which the plugin commands read too, and ` +
  `'apimatic sdk publish' adds to it.`;

/**
 * Read from the top-level `languages` block the plugin commands share. An entry without a
 * `publishing` record counts: it is a language the project wants and has not published yet.
 */
export class PortalLanguages {
  private constructor(private readonly languages: readonly Language[]) {}

  /** `findings` already covers a block or an entry of the wrong shape, so neither is checked here. */
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
      errors.push(`'languages.${key}' is not an SDK language; name one of ${quotedList(KNOWN_LANGUAGES)}.`);
    }
    if (errors.length > 0) {
      return err(errors);
    }
    return ok(new PortalLanguages(keys as Language[]));
  }

  public all(): Language[] {
    return [...this.languages];
  }
}
