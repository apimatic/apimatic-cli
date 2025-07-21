export class FileName {
  private readonly name: string;

  constructor(path: string) {
    this.name = path;
  }

  public toString(): string {
    return this.name;
  }
}
