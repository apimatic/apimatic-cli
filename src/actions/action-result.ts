export enum ActionResultType {
  Success,
  Error,
  Cancelled
}

export class ActionResult {
  private readonly type: ActionResultType;
  private readonly message: string | undefined;

  private constructor(type: ActionResultType, message?: string) {
    this.type = type;
    this.message = message;
  }

  static error(message: string) {
    return new ActionResult(ActionResultType.Error, message);
  }

  static success() {
    return new ActionResult(ActionResultType.Success);
  }

  static cancelled(message?: string) {
    return new ActionResult(ActionResultType.Cancelled, message);
  }

  map(onError: (message: string) => void) {
    if (this.type === ActionResultType.Error && this.message) {
      onError(this.message);
    }
  }

  mapAll<T>(onSuccess: () => T, onError: (message: string) => T, onCancelled: (message: string) => T) {
    switch (this.type) {
      case ActionResultType.Success:
        return onSuccess();
      case ActionResultType.Error:
        return onError(this.message || 'Unknown error');
      case ActionResultType.Cancelled:
        return onCancelled(this.message || 'Operation cancelled');
      default:
        throw new Error(`Unknown ActionResultType: ${this.type}`);
    }
  }

  getType(): ActionResultType {
    return this.type;
  }

  isSuccess(): boolean {
    return this.type === ActionResultType.Success;
  }

  isError(): boolean {
    return this.type === ActionResultType.Error;
  }

  isCancelled(): boolean {
    return this.type === ActionResultType.Cancelled;
  }
}