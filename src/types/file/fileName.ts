import path from "path";

export class FileName {
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  public isZipFile() {
    return path.extname(this.name).toLowerCase() === ".zip";
  }

  public isMarkDown() {
    return this.name.endsWith(".md");
  }

  public normalize(): FileName {
    const nameWithoutExt = this.name.replace(/\.[^/.]+$/, "");
    const normalized = nameWithoutExt
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "");
    return new FileName(normalized);
  }

  public toString(): string {
    return this.name;
  }
}