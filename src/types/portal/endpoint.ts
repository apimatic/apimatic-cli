export class Endpoint {
  public readonly method: string;

  constructor(method: string, public readonly path: string) {
    this.method = method.toUpperCase();
  }

  public isEqual(other: Endpoint): boolean {
    return this.method === other.method && this.path === other.path;
  }

  public toString(): string {
    return `${this.method} ${this.path}`;
  }
}
