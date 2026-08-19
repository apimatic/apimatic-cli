import { Result, ok, err } from 'neverthrow';

/**
 * Structural only — it also admits strings `tryCreate` rejects, such as `1.2.3.4`. It is useful as
 * the return type of an already-validated `SemVersion`, never as a substitute for one.
 */
export type SemVersionString = `${number}.${number}.${number}`;

const DIGITS = /^\d+$/;

export class SemVersion {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static tryCreate(value: string): Result<SemVersion, string> {
    const parts = value.split('.');
    // Each part is matched as digits rather than run through `Number`, which also accepts the
    // surrounding whitespace, `Infinity`, `0x10` and `1e3` — all of which would be written into
    // the published package's version verbatim.
    if (parts.length !== 3 || !parts.every((p) => DIGITS.test(p))) {
      return err('Invalid version format. Expected major.minor.patch (e.g., 1.0.0).');
    }
    return ok(new SemVersion(value));
  }

  // The narrower type is honest because `tryCreate` is the only way in.
  public toString(): SemVersionString {
    return this.value as SemVersionString;
  }
}
