import path from "path";
import { FileName } from "./fileName.js";

export class UrlPath {
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  public toString(): string {
    return this.url;
  }

  public fileName(): FileName {
    return new FileName(path.basename(this.url));
  }
}
