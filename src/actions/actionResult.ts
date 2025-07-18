export class ActionResult {
  private readonly message: string | undefined;

  private constructor(message?: string) {
    this.message = message;
  }

  static error(message: string) {
    return new ActionResult(message);
  }

  static success() {
    return new ActionResult();
  }

  map(onError: (message: string) => void) {
    if (this.message) {
      onError(this.message);
    }
  }
}
