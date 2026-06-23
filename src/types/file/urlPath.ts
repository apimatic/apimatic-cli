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

  /** The URL's port. Falls back to the protocol default (443 for https, 80 otherwise) when none is specified. */
  public port(): number {
    const parsed = new URL(this.url);
    if (parsed.port) {
      return Number(parsed.port);
    }
    return parsed.protocol === "https:" ? 443 : 80;
  }
}
