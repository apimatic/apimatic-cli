enum ResultType {
  Success = 0,
  Cancel = 130,
  Failure = 1,
}

export class ActionResult<T = void> {
  private readonly message: string;
  private readonly resultType: ResultType;
  private readonly value?: T;

  private constructor(resultType: ResultType, message: string, value?: T) {
    this.resultType = resultType;
    this.message = message;
    this.value = value;
  }

  static success<T>(value?: T): ActionResult<T> {
    return new ActionResult<T>(ResultType.Success, "Succeeded", value);
  }

  static failed(message = "Failed"): ActionResult<never> {
    return new ActionResult(ResultType.Failure, message);
  }

  static cancelled(message = "Cancelled"): ActionResult<never> {
    return new ActionResult(ResultType.Cancel, message);
  }

  static stopped(message = "Stopped"): ActionResult<never> {
    return new ActionResult(ResultType.Cancel, message);
  }

  public getMessage(): string {
    return this.message;
  }

  public getExitCode(): number {
    return this.resultType.valueOf();
  }

  public isFailed(): boolean {
    return this.resultType === ResultType.Failure;
  }

  public isSuccess(): boolean {
    return this.resultType === ResultType.Success;
  }

  public isCancelled(): boolean {
    return this.resultType === ResultType.Cancel;
  }

  public getValue(): T | undefined {
    return this.value;
  }

  public mapAll<R>(
    onSuccess: (value?: T) => R,
    onFailure: () => R,
    onCancel: () => R
  ): R {
    switch (this.resultType) {
      case ResultType.Success:
        return onSuccess(this.value);
      case ResultType.Failure:
        return onFailure();
      case ResultType.Cancel:
        return onCancel();
    }
  }
}
