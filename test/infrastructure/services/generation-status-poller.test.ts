import { expect } from "chai";
import { Status } from "@apimatic/sdk";
import { err, ok, Result } from "neverthrow";
import {
  GenerationStatusPoller,
  GenerationStatusResponse,
  ValidationErrorFormatter
} from "../../../src/infrastructure/services/generation-status-poller";
import { ServiceError, ServiceErrorCode } from "../../../src/infrastructure/service-error";

/** Replays a fixed script of status responses, one per poll, and counts the calls. */
const fetcherFor = (responses: Result<GenerationStatusResponse, ServiceError>[]) => {
  let calls = 0;
  const fetchStatus = async () => responses[calls++];
  return { fetchStatus, callCount: () => calls };
};

describe("GenerationStatusPoller", () => {
  // Zero interval keeps the tests fast; production uses the 3s default.
  const poller = new GenerationStatusPoller(0);

  it("resolves with the status once generation completes", async () => {
    const { fetchStatus } = fetcherFor([ok({ status: Status.Completed })]);

    const result = await poller.pollUntilCompleted(fetchStatus);

    expect(result.isOk()).to.be.true;
    expect(result._unsafeUnwrap().status).to.equal(Status.Completed);
  });

  it("keeps polling while generation is in progress", async () => {
    const { fetchStatus, callCount } = fetcherFor([
      ok({ status: Status.InProgress }),
      ok({ status: Status.InProgress }),
      ok({ status: Status.Completed })
    ]);

    const result = await poller.pollUntilCompleted(fetchStatus);

    expect(result.isOk()).to.be.true;
    expect(callCount()).to.equal(3);
  });

  it("propagates an error from the status request", async () => {
    const { fetchStatus, callCount } = fetcherFor([err(ServiceError.UnAuthorized)]);

    const result = await poller.pollUntilCompleted(fetchStatus);

    expect(result._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.UnAuthorized);
    expect(callCount()).to.equal(1);
  });

  it("maps a Failed status onto a server error", async () => {
    const { fetchStatus } = fetcherFor([ok({ status: Status.Failed })]);

    const result = await poller.pollUntilCompleted(fetchStatus);

    expect(result._unsafeUnwrapErr().code).to.equal(ServiceErrorCode.ServerError);
  });

  it("lists every validation message and preserves the raw errors", async () => {
    const { fetchStatus } = fetcherFor([
      ok({
        status: Status.ValidationError,
        errors: { spec: ["First problem", "Second problem"], build: ["Third problem"] }
      })
    ]);

    const result = await poller.pollUntilCompleted(fetchStatus);
    const error = result._unsafeUnwrapErr();

    expect(error.code).to.equal(ServiceErrorCode.BadRequest);
    expect(error.errorMessage).to.equal(
      "One or more validation errors occurred.\n- First problem\n- Second problem\n- Third problem"
    );
    expect(error.getError("spec")).to.deep.equal(["First problem", "Second problem"]);
  });

  it("applies a caller-supplied validation formatter", async () => {
    const formatMergeConflict: ValidationErrorFormatter = (errors) =>
      "Merge conflict in: " + (errors.sdkMergeFailed ?? []).join(", ");
    const { fetchStatus } = fetcherFor([
      ok({ status: Status.ValidationError, errors: { sdkMergeFailed: ["java", "python"] } })
    ]);

    const result = await poller.pollUntilCompleted(fetchStatus, formatMergeConflict);

    expect(result._unsafeUnwrapErr().errorMessage).to.equal("Merge conflict in: java, python");
  });

  it("terminates on a validation error that carries no messages", async () => {
    const { fetchStatus, callCount } = fetcherFor([ok({ status: Status.ValidationError })]);

    const result = await poller.pollUntilCompleted(fetchStatus);

    expect(result._unsafeUnwrapErr().errorMessage).to.equal("One or more validation errors occurred.");
    expect(callCount()).to.equal(1);
  });

  it("maps a SubscriptionError onto a forbidden error with the first message", async () => {
    const { fetchStatus } = fetcherFor([
      ok({ status: Status.SubscriptionError, errors: { subscription: ["Quota exceeded"] } })
    ]);

    const result = await poller.pollUntilCompleted(fetchStatus);
    const error = result._unsafeUnwrapErr();

    expect(error.code).to.equal(ServiceErrorCode.Forbidden);
    expect(error.errorMessage).to.equal("Access denied to resource.\n- Quota exceeded");
  });

  it("omits the bullet when a SubscriptionError carries no messages", async () => {
    const { fetchStatus } = fetcherFor([ok({ status: Status.SubscriptionError })]);

    const result = await poller.pollUntilCompleted(fetchStatus);

    expect(result._unsafeUnwrapErr().errorMessage).to.equal("Access denied to resource.");
  });
});
