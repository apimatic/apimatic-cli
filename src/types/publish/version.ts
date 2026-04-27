import { Result, ok, err } from 'neverthrow';

export class SemVersion {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static tryCreate(value: string): Result<SemVersion, string> {
    const parts = value.split('.');
    if (parts.length !== 3 || !parts.every((p) => p !== '' && !isNaN(Number(p)) && Number(p) >= 0)) {
      return err('Invalid version format. Expected major.minor.patch (e.g., 1.0.0).');
    }
    return ok(new SemVersion(value));
  }

  public toString(): string {
    return this.value;
  }
}
