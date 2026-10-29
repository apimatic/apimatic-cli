import { err, ok, Result } from 'neverthrow';
import { isWebAddress } from '../config/fields.js';
import { PortalConfig } from '../portal-config.js';
import { CopilotKeyKind } from './copilot-key.js';

/** As the Ask AI service receives it. */
interface CopilotRegistrationBody {
  name: string;
  siteUrl: string | null;
  allowedOrigins: string[];
}

export type CopilotRegistrationProblem =
  | { kind: 'invalidOrigin'; value: string }
  /** A deployed portal's key is refused everywhere but the sites listed for it, so it needs at least one. */
  | { kind: 'noOrigins' };

/** What the Ask AI service is told about a portal: its name, where it is deployed, and the sites allowed to use its key. */
export class CopilotRegistration {
  private constructor(
    private readonly name: string,
    private readonly siteUrl: string | null,
    private readonly allowedOrigins: string[]
  ) {}

  /** The portal's `site.url` is always allowed; `origins` adds others, such as a staging site. */
  public static of(
    config: PortalConfig,
    origins: readonly string[],
    kind: CopilotKeyKind
  ): Result<CopilotRegistration, CopilotRegistrationProblem[]> {
    const invalid = origins.filter((origin) => originOf(origin) === null);
    if (invalid.length > 0) {
      return err(invalid.map((value): CopilotRegistrationProblem => ({ kind: 'invalidOrigin', value })));
    }
    const site = config.siteAddress();
    const allowed = [
      ...new Set([...(site === null ? [] : [site.siteOrigin()]), ...origins.map((origin) => originOf(origin)!)])
    ];
    if (allowed.length === 0 && kind === 'live') {
      return err([{ kind: 'noOrigins' }]);
    }
    return ok(new CopilotRegistration(config.siteTitle(), site === null ? null : site.toString(), allowed));
  }

  public origins(): readonly string[] {
    return this.allowedOrigins;
  }

  public toJSON(): CopilotRegistrationBody {
    return { name: this.name, siteUrl: this.siteUrl, allowedOrigins: this.allowedOrigins };
  }
}

/** The origin the text names, written as one: a scheme and a host, an optional port, and nothing after. */
function originOf(text: string): string | null {
  const trimmed = text.trim();
  if (!isWebAddress(trimmed)) {
    return null;
  }
  const origin = new URL(trimmed).origin;
  return trimmed.toLowerCase().replace(/\/$/, '') === origin.toLowerCase() ? origin : null;
}
