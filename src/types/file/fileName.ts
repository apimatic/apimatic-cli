import path from "path";

export class FileName {
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  public isZipFile() {
    return path.extname(this.name).toLowerCase() === ".zip";
  }

  public toString(): string {
    return this.name;
  }
}
