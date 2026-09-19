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

  /** Whether this is `name`, compared without regard to case. */
  public is(name: string): boolean {
    return this.name.toLowerCase() === name.toLowerCase();
  }

  public normalize(): FileName {
    const nameWithoutExt = this.name.replace(/\.[^/.]+$/, '');
    const normalized = nameWithoutExt
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
