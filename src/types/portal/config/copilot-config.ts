import { err, ok, Result } from 'neverthrow';
import { allOf, namespace, nonEmptyString, optional, Parsed, unknownKeys } from './fields.js';
import { ServiceAddress } from './service-address.js';

const KNOWN = ['key', 'suggestions'];
const MAX_SUGGESTIONS = 3;
const MAX_SUGGESTION_LENGTH = 120;

export interface PortalCopilot {
  key: string;
  /** The Ask AI service's origin. */
  apiUrl: string;
  /** Starter questions on a new chat; empty for the chat's own. */
  suggestions: string[];
}

type CopilotBlock = Pick<PortalCopilot, 'key'> & { suggestions?: string[] };

/** What `sync` needs of the Ask AI settings: which portal's chat it is, and the service it is on. */
export interface CopilotService {
  key: string;
  address: ServiceAddress;
}

export class CopilotConfig {
  private constructor(
    private readonly key: string,
    private readonly address: ServiceAddress,
    private readonly suggestions: string[]
  ) {}

  /** The block names the portal's key; the service is the one this run of the CLI uses. */
  public static parse(value: unknown, path: string): Parsed<CopilotConfig> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        // The key is not checked here: the Ask AI service validates it, and its design may change.
        Result.combineWithAllErrors([
          nonEmptyString(data.key, `${path}.key`),
          ServiceAddress.current(),
          optional(data.suggestions, (present) => suggestionList(present, `${path}.suggestions`))
        ])
      ).map(([key, address, suggestions]) => new CopilotConfig(key, address, suggestions ?? []))
    );
  }

  /** As the browser is told it. */
  public identity(): PortalCopilot {
    return { key: this.key, apiUrl: this.address.toString(), suggestions: this.suggestions };
  }

  public service(): CopilotService {
    return { key: this.key, address: this.address };
  }

  public toJSON(): CopilotBlock {
    return {
      key: this.key,
      ...(this.suggestions.length > 0 ? { suggestions: this.suggestions } : {})
    };
  }
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
