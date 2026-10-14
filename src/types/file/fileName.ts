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

  /** Whether this is `other` exactly, case included, as a host that serves or reads the file matches it. */
  public isEqual(other: FileName): boolean {
    return this.name === other.name;
  }

  /** Whether the name starts with a dot, as a placeholder or an operating system's own file does. */
  public isHidden(): boolean {
    return this.name.startsWith('.');
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
    return this.withoutExtension().slugified();
  }

  /** The whole name as a URL segment, for a folder's name, whose dots end no extension. */
  public slugified(): FileName {
    const slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '');
    return new FileName(slug);
  }

  public toString(): string {
    return this.name;
  }
}
