export class WatcherHandler {
  private isProcessing = false;
  private latestHandler: (() => Promise<void>) | null = null;

  async execute(handler: () => Promise<void>): Promise<void> {
    // Always store the latest handler
    this.latestHandler = handler;

    // If already processing, just wait for current to finish
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Keep processing until no new handlers arrive
      while (this.latestHandler) {
        const currentHandler = this.latestHandler;
        this.latestHandler = null;
        
        await currentHandler();
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
