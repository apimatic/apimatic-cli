enum ResultType {
  Success= 0,
  Cancel = 130,
  Failure= 1
}

export class ActionResult {
  private readonly message: string;
  private readonly resultType: ResultType;

  private constructor(resultType: ResultType, message: string) {
    this.resultType = resultType;
    this.message = message;
  }

  static success() {
    return new ActionResult(ResultType.Success, " Succeeded ");
  }

  static failed() {
    return new ActionResult(ResultType.Failure, " Failed ");
  }

  static cancelled() {
    return new ActionResult(ResultType.Cancel, " Cancelled ");
  }

  public getMessage() {
    return this.message;
  }

  public getExitCode() {
    return this.resultType.valueOf();
  }

  public mapAll<T>(onSuccess: () => T, onFailure: () => T, onCancel: () => T): T {
    switch (this.resultType) {
      case ResultType.Success:
        return onSuccess();
      case ResultType.Failure:
        return onFailure();
      case ResultType.Cancel:
        return onCancel();
    }
  }
}
