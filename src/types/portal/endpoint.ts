export class Endpoint {
  public readonly method: string;

  constructor(method: string, public readonly path: string) {
    this.method = method.toUpperCase();
  }

  public toString(): string {
    return `${this.method} ${this.path}`;
  }
}
