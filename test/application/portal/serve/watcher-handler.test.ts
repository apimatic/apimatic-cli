import { expect } from "chai";
import { WatcherHandler } from "../../../../src/application/portal/serve/watcher-handler.js";

describe("WatcherHandler", () => {
  it("should execute handler immediately if not processing", async () => {
    const handler = new WatcherHandler();
    let called = false;
    await handler.execute(async () => {
      called = true;
    });
    expect(called).to.be.true;
  });

  it("should only run the latest handler if called multiple times while processing", async () => {
    const handler = new WatcherHandler();
    let callOrder: string[] = [];
    let resolveFirst: () => void;
    const firstPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    // Start first handler (will not resolve immediately)
    handler.execute(async () => {
      callOrder.push("first");
      await firstPromise;
    });
    // Queue up two more handlers
    await handler.execute(async () => {
      callOrder.push("second");
    });
    await handler.execute(async () => {
      callOrder.push("third");
    });
    // Now resolve the first handler
    resolveFirst!();
    // Wait a tick for the queued handler to run
    await new Promise((r) => setTimeout(r, 10));
    // Only the first and the last (third) should run
    expect(callOrder).to.deep.equal(["first", "third"]);
  });
}); 