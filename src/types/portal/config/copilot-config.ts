import { err, ok, Result } from 'neverthrow';
import { allOf, isWebAddress, namespace, nonEmptyString, optional, Parsed, unknownKeys } from './fields.js';

const KNOWN = ['key', 'apiUrl', 'suggestions'];
const MAX_SUGGESTIONS = 3;
const MAX_SUGGESTION_LENGTH = 120;

export interface PortalCopilot {
  key: string;
  /** The Ask AI service's origin. */
  apiUrl: string;
  /** Starter questions on a new chat; empty for the chat's own. */
  suggestions: string[];
}

type CopilotBlock = Omit<PortalCopilot, 'suggestions'> & { suggestions?: string[] };

export class CopilotConfig {
  private constructor(
    private readonly key: string,
    private readonly apiOrigin: string,
    private readonly suggestions: string[]
  ) {}

  public static parse(value: unknown, path: string): Parsed<CopilotConfig> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        // The key is not checked here: the Ask AI service validates it, and its design may change.
        Result.combineWithAllErrors([
          nonEmptyString(data.key, `${path}.key`),
          serviceOrigin(data.apiUrl, `${path}.apiUrl`),
          optional(data.suggestions, (present) => suggestionList(present, `${path}.suggestions`))
        ])
      ).map(([key, apiOrigin, suggestions]) => new CopilotConfig(key, apiOrigin, suggestions ?? []))
    );
  }

  public identity(): PortalCopilot {
    return { key: this.key, apiUrl: this.apiOrigin, suggestions: this.suggestions };
  }

  public toJSON(): CopilotBlock {
    return {
      key: this.key,
      apiUrl: this.apiOrigin,
      ...(this.suggestions.length > 0 ? { suggestions: this.suggestions } : {})
    };
  }
}

// Only names that never leave the machine: a `*.localhost` name is resolved through DNS on some systems, Windows' Node among them.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const APIMATIC_DOMAIN = 'apimatic.io';

function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname);
}

function isApimatic(url: URL): boolean {
  return (
    url.protocol === 'https:' && (url.hostname === APIMATIC_DOMAIN || url.hostname.endsWith(`.${APIMATIC_DOMAIN}`))
  );
}

// Required while there is no hosted service; once there is, default to its address and keep this as an override.
// `sync` sends the APIMatic login to this address, so it is APIMatic's own service, over HTTPS, or one on this
// machine while developing it: no other service is offered, and none should be handed an APIMatic login.
function serviceOrigin(value: unknown, path: string): Parsed<string> {
  const url = typeof value === 'string' && isWebAddress(value) ? new URL(value) : null;
  return url !== null && (isApimatic(url) || isLoopback(url))
    ? ok(url.origin)
    : err([
        `'${path}' must be the address of APIMatic's Ask AI service, starting with 'https://' and ending in ` +
          `'${APIMATIC_DOMAIN}', or of one on this machine, such as 'http://localhost:8787'.`
      ]);
}

function suggestionList(value: unknown, path: string): Parsed<string[]> {
  const valid =
    Array.isArray(value) &&
    value.length <= MAX_SUGGESTIONS &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= MAX_SUGGESTION_LENGTH);
  return valid
    ? ok(value.map((item: string) => item.trim()))
    : err([
        `'${path}' must be a list of up to ${MAX_SUGGESTIONS} questions, each a non-empty string of at most ${MAX_SUGGESTION_LENGTH} characters.`
      ]);
}
