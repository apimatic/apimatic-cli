export class ProfileId {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static create(value: string): ProfileId | undefined {
    if (!value || value.trim() === '') {
      return undefined;
    }
    return new ProfileId(value);
  }

  public isEqual(other: ProfileId): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
