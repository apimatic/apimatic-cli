export class Endpoint {
  private readonly method: string;

  constructor(method: string, private readonly path: string) {
    this.method = method.toUpperCase();
  }

  public toString(): string {
    return `${this.method} ${this.path}`;
  }
}
