enum ResultType {
  Success,
  Warning,
  Error
}

export class ActionResult {
  private readonly message: string | undefined;
  private readonly resultType: ResultType;

  private constructor(resultType: ResultType, message?: string) {
    this.resultType = resultType;
    this.message = message;
  }

  static error(message: string) {
    return new ActionResult(ResultType.Error, message);
  }

  static error2() {
    return new ActionResult(ResultType.Error);
  }

  static warning(message: string) {
    return new ActionResult(ResultType.Warning, message);
  }

  static success() {
    return new ActionResult(ResultType.Success);
  }

  map(onError: (message: string) => void, onWarning?: (message: string) => void) {
    if (this.resultType === ResultType.Error) {
      onError(this.message!);
    } else if (this.resultType === ResultType.Warning && onWarning && this.message) {
      onWarning(this.message);
    }
  }

  mapAll<T>(onSuccess: () => T, onWarning: (message: string) => T, onError: (message: string) => T) {
    switch (this.resultType) {
      case ResultType.Error:
        return onError(this.message!);
      case ResultType.Warning:
        return onWarning(this.message!);
      default:
        return onSuccess();
    }
  }
}
