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

  /** True when the URL points at the local machine (`localhost` or `127.0.0.1`). */
  public isLocalhost(): boolean {
    const hostname = new URL(this.url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  /** Structural equality against another URL. */
  public isEqual(other: UrlPath): boolean {
    return this.url === other.url;
  }
}
