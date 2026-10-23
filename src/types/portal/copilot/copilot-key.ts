import { randomInt } from 'node:crypto';
import { err, ok, Result } from 'neverthrow';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const BODY_LENGTH = 32;
const PATTERN = /^pk_(dev|live)_[A-Za-z0-9]{24,64}$/;

/**
 * `live` for a deployed portal; `dev` for one previewed on this machine, which the service also
 * serves on `localhost` and caps at a number of questions a day.
 */
export type CopilotKeyKind = 'dev' | 'live';

/** Why the key in `apimatic.json` is not the one to keep: not a key the service accepts, or of the other kind. */
export type CopilotKeyProblem = { kind: 'unrecognized' } | { kind: 'otherKind'; current: CopilotKeyKind };

/** A portal's public Ask AI key, in the format the Ask AI service accepts. */
export class CopilotKey {
  private constructor(
    private readonly value: string,
    private readonly keyKind: CopilotKeyKind
  ) {}

  public static generate(kind: CopilotKeyKind): CopilotKey {
    const body = Array.from({ length: BODY_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    return new CopilotKey(`pk_${kind}_${body}`, kind);
  }

  /** The key as written in `apimatic.json`, or null when it is not one the service would accept. */
  public static parse(text: string): CopilotKey | null {
    const match = PATTERN.exec(text);
    return match === null ? null : new CopilotKey(text, match[1] as CopilotKeyKind);
  }

  /** The key `apimatic.json` holds, when it is one to keep using for a portal that wants a `kind` key. */
  public static reusable(text: string, kind: CopilotKeyKind): Result<CopilotKey, CopilotKeyProblem> {
    const key = CopilotKey.parse(text);
    if (key === null) {
      return err({ kind: 'unrecognized' });
    }
    return key.kind() === kind ? ok(key) : err({ kind: 'otherKind', current: key.kind() });
  }

  public kind(): CopilotKeyKind {
    return this.keyKind;
  }

  public equals(other: CopilotKey): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
