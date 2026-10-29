enum ResultType {
  Success,
  Failure,
  Cancel,
  Conflict
}

/**
 * A conflicted run exits as `git merge` does on conflicts: files are left to resolve, so whatever
 * is chained after it should not run. Two kinds share a code, so the codes are kept apart from them.
 */
const EXIT_CODES: Record<ResultType, number> = {
  [ResultType.Success]: 0,
  [ResultType.Failure]: 1,
  [ResultType.Cancel]: 130,
  [ResultType.Conflict]: 1
};

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
    return new ActionResult<T>(ResultType.Success, 'Succeeded', value);
  }

  static failed<T = never, E = never>(message = 'Failed', error?: E): ActionResult<T, E> {
    return new ActionResult<T, E>(ResultType.Failure, message, undefined, error);
  }

  static cancelled<T = never>(message = 'Cancelled'): ActionResult<T> {
    return new ActionResult(ResultType.Cancel, message);
  }

  static stopped<T = never>(message = 'Stopped'): ActionResult<T> {
    return new ActionResult(ResultType.Cancel, message);
  }

  /** The run ended with files the developer still has to resolve. */
  static conflicted<T = never>(message = 'Conflicted'): ActionResult<T> {
    return new ActionResult(ResultType.Conflict, message);
  }

  public getMessage(): string {
    return this.message;
  }

  public getExitCode(): number {
    return EXIT_CODES[this.resultType];
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

  public isConflicted(): boolean {
    return this.resultType === ResultType.Conflict;
  }

  public getValue(): T {
    if (!this.isSuccess()) {
      throw new Error(`Cannot unwrap ${ResultType[this.resultType]} result: ${this.message}`);
    }
    return this.value!;
  }

  public getError(): E | undefined {
    return this.error;
  }

  public discardValue(): ActionResult {
    return new ActionResult(this.resultType, this.message);
  }

  public mapAll<R>(onSuccess: (value?: T) => R, onFailure: () => R, onCancel: () => R, onConflict: () => R): R {
    switch (this.resultType) {
      case ResultType.Success:
        return onSuccess(this.value);
      case ResultType.Failure:
        return onFailure();
      case ResultType.Cancel:
        return onCancel();
      case ResultType.Conflict:
        return onConflict();
    }
  }
}
