import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import hook from "../../src/hooks/not-found.js";
import utils from "../../src/hooks/utils.js";

// The hook re-enters itself through `config.runCommand`, so every assertion here is really
// about that recursion: a suggestion the hook cannot run used to prompt forever.
describe("command_not_found hook", () => {
  let config: Config;
  let sandbox: sinon.SinonSandbox;
  let warnings: string[];
  let errors: string[];
  let isTTY: boolean | undefined;

  const run = async (id: string, argv: string[] = []) => {
    const context = {
      config,
      error: (message: string) => {
        errors.push(message);
        throw new Error(message);
      },
      warn: (message: string) => warnings.push(message)
    };

    return (hook as (...args: never[]) => Promise<unknown>).call(
      context as never,
      {
        argv,
        config,
        id
      } as never
    );
  };

  const expectListHint = async (id: string) => {
    try {
      await run(id);
      expect.fail(`expected ${id} to end with the list hint`);
    } catch {
      expect(errors).to.have.lengthOf(1);
    }
  };

  before(async () => {
    config = await Config.load(process.cwd());
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    warnings = [];
    errors = [];
    isTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  });

  afterEach(() => {
    sandbox.restore();
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: isTTY });
  });

  it("never suggests a string that is not a runnable command", async () => {
    const confirm = sandbox.stub(utils, "getConfirmation").resolves(true);
    sandbox.stub(utils, "closest").returns("help:auth");

    await expectListHint("auth:help");

    expect(confirm.called).to.be.false;
  });

  it("runs the accepted suggestion with the original argv", async () => {
    sandbox.stub(utils, "getConfirmation").resolves(true);
    const runCommand = sandbox.stub(config, "runCommand").resolves();

    await run("sdk:genrate", ["--api-key", "x"]);

    expect(runCommand.calledOnceWithExactly("sdk:generate", ["--api-key", "x"])).to.be.true;
  });

  it("does not re-prompt when the accepted suggestion fails to resolve", async () => {
    const confirm = sandbox.stub(utils, "getConfirmation").resolves(true);
    // Simulate the retry itself landing back in the hook.
    sandbox.stub(config, "runCommand").callsFake(async (id) => run(id as string));

    try {
      await run("sdk:genrate");
    } catch {
      // The retry reports the failure rather than asking again.
    }

    expect(confirm.callCount, "should prompt at most once").to.equal(1);
  });

  it("points at `apimatic help`, never `apimatic help help`", async () => {
    sandbox.stub(utils, "getConfirmation").resolves(false);

    await expectListHint("help:zzz");

    expect(errors[0]).to.contain("apimatic help ");
    expect(errors[0]).to.not.contain("help help");
  });

  it("narrows the hint to a real topic", async () => {
    sandbox.stub(utils, "getConfirmation").resolves(false);

    await expectListHint("sdk:genrate");

    expect(errors[0]).to.contain("apimatic help sdk");
  });

  it("uses the correct article for the bin name", async () => {
    sandbox.stub(utils, "getConfirmation").resolves(false);

    await expectListHint("zzz");

    expect(warnings[0]).to.contain("is not an apimatic command");
  });
});
