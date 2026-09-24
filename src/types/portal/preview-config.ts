import { ApiConfig } from './config/api-config.js';
import { PortalConfig } from './portal-config.js';

/** What the user is told about an accepted edit before it is applied. */
export interface PreviewNotices {
  /** The reference pages are made once, from the `portal.api` settings at startup. */
  restartNeeded: boolean;
  staticDirectoryNotServed: boolean;
}

/**
 * The `portal` block a running `portal serve` shows, and what each edit to it calls for. Each
 * notice is given once, on the save that brings it about, rather than on every save after it.
 */
export class PreviewConfig {
  private readonly running: ApiConfig;
  private shown: PortalConfig;
  private refused = false;

  /**
   * `servesStatic`: the dev server serves `static/` only if it was there at startup, and a
   * block that names a file in it was refused unless it was.
   */
  constructor(startup: PortalConfig, private readonly servesStatic: boolean) {
    this.running = startup.apiSettings();
    this.shown = startup;
  }

  public refuse(): void {
    this.refused = true;
  }

  public noticesFor(config: PortalConfig): PreviewNotices {
    const api = config.apiSettings();
    return {
      restartNeeded: !api.isEqual(this.shown.apiSettings()) && !api.isEqual(this.running),
      staticDirectoryNotServed:
        !this.servesStatic && config.staticFiles().length > 0 && this.shown.staticFiles().length === 0
    };
  }

  /**
   * Records the edit as shown, and answers whether to say it was applied. A file fixed back to
   * what the preview already shows writes nothing, but the user was told it was refused, so
   * hears that it is accepted again.
   */
  public show(config: PortalConfig, written: boolean): boolean {
    const announce = written || this.refused;
    this.refused = false;
    this.shown = config;
    return announce;
  }
}
