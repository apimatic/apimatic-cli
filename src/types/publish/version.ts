export class SemVersion {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static create(value: string): SemVersion | undefined {   
    const parts = value.split('.');
    if (parts.length !== 3 || !parts.every((p) => p !== '' && !isNaN(Number(p)) && Number(p) >= 0)) {
      return undefined;
    }
    return new SemVersion(value);
  }

  public toString(): string {
    return this.value;
  }
}
