export class FileName {
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  public isMarkDown() {
    return this.hasExtension('.md');
  }

  /** Whether the name ends in `extension`, compared without regard to case. */
  public hasExtension(extension: string): boolean {
    return this.name.toLowerCase().endsWith(extension.toLowerCase());
  }

  /** Whether the name ends in `extension` exactly, by code point, the way a glob matches it. */
  public hasExactExtension(extension: string): boolean {
    return this.name.endsWith(extension);
  }

  /** Whether this is `name`, compared without regard to case. */
  public is(name: string): boolean {
    return this.name.toLowerCase() === name.toLowerCase();
  }

  // By code point rather than collation: callers sort on this to decide which of two names
  // keeps a slug they both normalise to, and a locale-sensitive order would settle that
  // differently from one machine to the next.
  public compare(other: FileName): number {
    return this.name < other.name ? -1 : Number(this.name > other.name);
  }

  public withoutExtension(): FileName {
    return new FileName(this.name.replace(/\.[^/.]+$/, ''));
  }

  public normalize(): FileName {
    const normalized = this.withoutExtension()
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '');
    return new FileName(normalized);
  }

  public toString(): string {
    return this.name;
  }
}
