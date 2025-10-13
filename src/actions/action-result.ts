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

  static failed<T = never>(message = "Failed"): ActionResult<T> {
    return new ActionResult(ResultType.Failure, message);
  }

  static cancelled<T = never>(message = "Cancelled"): ActionResult<T> {
    return new ActionResult(ResultType.Cancel, message);
  }

  static stopped<T = never>(message = "Stopped"): ActionResult<T> {
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

  public match<R>(
    onSuccess: (value: T) => R,
    onFailure: (message: string) => R,
    onCancel: (message: string) => R
  ): R {
    switch (this.resultType) {
      case ResultType.Success:
        return onSuccess(this.value!);
      case ResultType.Failure:
        return onFailure(this.message);
      case ResultType.Cancel:
        return onCancel(this.message);
    }
  }

  public unwrap(): T {
    if (!this.isSuccess()) {
      throw new Error(`Cannot unwrap ${ResultType[this.resultType]} result: ${this.message}`);
    }
    return this.value!;
  }

  public getValueOr(defaultValue: T): T {
    return this.isSuccess() ? this.value! : defaultValue;
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