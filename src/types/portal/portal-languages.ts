import { err, ok, Result } from 'neverthrow';
import { ConfigFinding, findingSentences } from '../apimatic-config/document.js';
import { Language, PLUGIN_LANGUAGES } from '../sdk/generate.js';
import { quotedList } from './config/fields.js';
import { PortalSdk } from './portal-sdk.js';

const KNOWN_LANGUAGES: readonly string[] = Object.values(Language);

// The languages the portal artifacts can be generated for today; the rest of `Language` comes later.
const AVAILABLE_LANGUAGES: readonly string[] = PLUGIN_LANGUAGES;

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
  private constructor(private readonly sdks: readonly PortalSdk[]) {}

  /** `findings` already covers a block or an entry of the wrong shape, so neither is checked here. */
  public static fromBlock(
    block: Record<string, unknown> | undefined,
    findings: readonly ConfigFinding[]
  ): Result<PortalLanguages, string[]> {
    const errors = findingSentences(findings);
    const entries = Object.entries(block ?? {});
    if (entries.length === 0 && findings.length === 0) {
      errors.push(REQUIRED);
    }
    for (const [key] of entries.filter(([key]) => !AVAILABLE_LANGUAGES.includes(key))) {
      errors.push(
        KNOWN_LANGUAGES.includes(key)
          ? `'languages.${key}' is not available yet; the portal supports ${quotedList(AVAILABLE_LANGUAGES)} today.`
          : `'languages.${key}' is not an SDK language; name one of ${quotedList(AVAILABLE_LANGUAGES)}.`
      );
    }
    if (errors.length > 0) {
      return err(errors);
    }
    return ok(new PortalLanguages(entries.map(([key, entry]) => PortalSdk.fromEntry(key as Language, entry))));
  }

  public all(): Language[] {
    return this.sdks.map((sdk) => sdk.language);
  }

  /** In the order the block lists them. */
  public listed(): PortalSdk[] {
    return [...this.sdks];
  }
}
