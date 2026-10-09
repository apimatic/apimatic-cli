enum ResultType {
  Success = 0,
  Cancel = 130,
  Failure = 1,
}

export class ActionResult<T = void, E = never> {
  private readonly message: string;
  private readonly resultType: ResultType;
  private readonly value?: T;
  private readonly error?: E;

  private constructor(resultType: ResultType, message: string, value?: T, error?: E) {
    this.resultType = resultType;
    this.message = message;
    this.value = value;
    this.error = error;
  }

  static success<T>(value?: T): ActionResult<T> {
    return new ActionResult<T>(ResultType.Success, "Succeeded", value);
  }

  static failed<T = never, E = never>(message = "Failed", error?: E): ActionResult<T, E> {
    return new ActionResult<T, E>(ResultType.Failure, message, undefined, error);
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

  public getValue(): T {
    if (!this.isSuccess()) {
      throw new Error(`Cannot unwrap ${ResultType[this.resultType]} result: ${this.message}`);
    }
    return this.value!;
  }

  public getValueOr(defaultValue: T): T {
    return this.isSuccess() ? this.value! : defaultValue;
  }

  public getError(): E | undefined {
    return this.error;
  }

  public discardValue(): ActionResult {
    return new ActionResult(this.resultType, this.message);
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