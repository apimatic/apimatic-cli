export class Result<T, TError> {
  private constructor(
    public readonly isSuccess: boolean,
    public readonly value?: T,
    public readonly error?: TError
  ) {}

  public static success<T, TError>(value: T): Result<T, TError> {
    return new Result<T, TError>(true, value, undefined);
  }

  public static failure<T, TError>(error: TError): Result<T, TError> {
    return new Result<T, TError>(false, undefined, error);
  }
}