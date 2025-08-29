import { clearTimeout, setTimeout } from "timers";

export class DebounceService {
  private isProcessing = false;
  private latestHandler: (() => Promise<void>) | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly debounceMs: number;

  constructor(debounceMs: number = 500) {
    this.debounceMs = debounceMs;
  }

  async batchSingleRequest(handler: () => Promise<void>): Promise<void> {
    // Always store the latest handler
    this.latestHandler = handler;

    // If already processing, don't start a new timer. Just update the latest handler
    if (this.isProcessing) {
      return;
    }

    // Clear any existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set up debounced execution
    this.scheduleExecution();
  }

  private scheduleExecution(): void {
    this.debounceTimer = setTimeout(async () => {
      if (this.isProcessing) {
        return;
      }

      this.isProcessing = true;
      this.debounceTimer = null;

      try {
        // Execute the latest handler if it exists
        if (this.latestHandler) {
          const currentHandler = this.latestHandler;
          this.latestHandler = null;
          await currentHandler();
        }
      } finally {
        this.isProcessing = false;
      }
    }, this.debounceMs);
  }

  // Method to clear any pending execution.
  public close(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.latestHandler = null;
  }
}
