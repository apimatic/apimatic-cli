import path from "path";
import { FileName } from "./fileName.js";
import { URL } from "url";

export class UrlPath {
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  public static create(url: string): UrlPath | undefined {
    try {
      const parsed = new URL(url);
      if (["http:", "https:"].includes(parsed.protocol)) {
        return new UrlPath(url);
      }
    } catch {
      // Not a valid URL
    }
    return undefined;
  }

  public toString(): string {
    return this.url;
  }
}
