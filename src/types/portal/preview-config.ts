import { PortalConfig } from './portal-config.js';
import { PreviewRefusal } from './preview-refusal.js';

/** The notice is given once, on the save that brings it about, rather than on every save after it. */
export class PreviewConfig {
  private shown: PortalConfig;
  private readonly refusal = new PreviewRefusal();

  /**
   * `servesStatic`: the dev server serves `static/` only if it was there at startup, and a
   * block that names a file in it was refused unless it was.
   */
  constructor(startup: PortalConfig, private readonly servesStatic: boolean) {
    this.shown = startup;
  }

  public refuse(): void {
    this.refusal.refuse();
  }

  public staticDirectoryNotServed(config: PortalConfig): boolean {
    return !this.servesStatic && config.staticFiles().length > 0 && this.shown.staticFiles().length === 0;
  }

  /**
   * Records the edit as shown, and answers whether to say it was applied: a file fixed back to
   * what the preview shows writes nothing, but the user was told it was refused, so hears that
   * it is accepted again.
   */
  public show(config: PortalConfig, written: boolean): boolean {
    // Not after `written ||`, which would skip it, and so say it is fixed again after the next save.
    const fixed = this.refusal.accept();
    this.shown = config;
    return written || fixed;
  }
}
