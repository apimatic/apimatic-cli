export class Result<T, TError> {
  private constructor(
    private readonly Status: ResultStatus,
    public readonly value?: T,
    public readonly error?: TError
  ) {}

  public static success<T, TError>(value: T): Result<T, TError> {
    return new Result<T, TError>(ResultStatus.Success, value, undefined);
  }

  public static failure<T, TError>(error: TError): Result<T, TError> {
    return new Result<T, TError>(ResultStatus.Failed, undefined, error);
  }

  public static cancelled<T, TError>(value: T): Result<T, TError> {
    return new Result<T, TError>(ResultStatus.Cancelled, value, undefined);
  }

  public isFailed(): boolean {
    return this.Status == ResultStatus.Failed;
  }

  public isCancelled(): boolean {
    return this.Status == ResultStatus.Cancelled;
  }

  public isSuccess(): boolean {
    return this.Status == ResultStatus.Success;
  }
}

export enum ResultStatus {
  Success,
  Failed,
  Cancelled
}
