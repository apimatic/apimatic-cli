import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import sinon from 'sinon';
import { MockServeAction, MockServeOptions } from '../../../src/actions/mock/serve.js';
import { fixedPlace, FREE_PORT } from '../../../src/infrastructure/mock/listen.js';
import { MockServePrompts } from '../../../src/prompts/mock/serve.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { LIFETIME_FROM_STUB } from '../../../src/types/mock/routing/token-lifetime.js';
import { occupied, portOf, released, send } from '../../helpers/mock-http.js';
import { TestRequest } from '../../helpers/mock-requests.js';
import { successStub } from '../../helpers/mock-stubs.js';

describe('MockServeAction', () => {
  let root: string;
  let prompts: sinon.SinonStubbedInstance<MockServePrompts>;
  let interrupt: () => void;

  const optionsWith = (overrides: Partial<MockServeOptions> = {}): MockServeOptions => ({
    stubs: new DirectoryPath(root),
    listen: FREE_PORT,
    tokenLifetime: LIFETIME_FROM_STUB,
    verbose: false,
    ...overrides
  });

  /** The origin the action announced, once it has; the action runs until `interrupt` is called. */
  const served = (): Promise<string> =>
    new Promise((resolve) => {
      prompts.mockServed.callsFake((url) => resolve(url));
    });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'apimatic-mock-serve-'));
    fs.writeFileSync(path.join(root, 'a.json'), successStub());
    prompts = sinon.stub(MockServePrompts.prototype);
    prompts.blockExecution.returns(
      new Promise((resolve) => {
        interrupt = resolve;
      })
    );
  });

  afterEach(() => {
    interrupt();
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('serves the stubs at the origin it announces until it is interrupted', async () => {
    const announced = served();
    const running = new MockServeAction().execute(optionsWith());

    const response = await send(await announced, TestRequest.get('/v1/x'));

    expect(response.status).to.equal(200);
    interrupt();
    await running;
  });

  it('announces the origin, the stubs directory and how many stubs it loaded', async () => {
    const announced = served();
    const running = new MockServeAction().execute(optionsWith());

    const url = await announced;

    expect(prompts.mockServed.firstCall.args).to.deep.equal([url, new DirectoryPath(root), 1]);
    interrupt();
    await running;
  });

  it('takes the stop signals over before it announces the origin, which a harness may act on at once', async () => {
    const announced = served();
    const running = new MockServeAction().execute(optionsWith());

    await announced;

    sinon.assert.callOrder(prompts.blockExecution, prompts.mockServed);
    interrupt();
    await running;
  });

  it('stops listening and ends as stopped once it is interrupted', async () => {
    const announced = served();
    const running = new MockServeAction().execute(optionsWith());
    const url = await announced;
    interrupt();

    const result = await running;

    const refused = await send(url, TestRequest.get('/v1/x')).then(
      () => false,
      () => true
    );
    expect([result.isCancelled(), result.getExitCode(), prompts.stopping.calledOnce, refused]).to.deep.equal([
      true,
      130,
      true,
      true
    ]);
  });

  it('reports every request on stderr when asked to be verbose', async () => {
    const announced = served();
    const running = new MockServeAction().execute(optionsWith({ verbose: true }));
    const url = await announced;

    await send(url, TestRequest.get('/v1/x').query('q', '1'));

    const [logged] = prompts.requestServed.firstCall.args;
    expect([logged.line, logged.status, logged.outcome.kind]).to.deep.equal(['GET /v1/x?q=1', 418, 'miss']);
    interrupt();
    await running;
  });

  it('reports no request unless asked to', async () => {
    const announced = served();
    const running = new MockServeAction().execute(optionsWith());

    await send(await announced, TestRequest.get('/v1/x'));

    expect(prompts.requestServed.called).to.equal(false);
    interrupt();
    await running;
  });

  it('lists the problems of the stubs and fails without serving', async () => {
    fs.writeFileSync(path.join(root, 'b.json'), 'nope');

    const result = await new MockServeAction().execute(optionsWith());

    const [problems, directory] = prompts.stubProblems.firstCall.args;
    expect([
      result.isFailed(),
      result.getExitCode(),
      problems.map((problem) => problem.file),
      directory,
      prompts.mockServed.called
    ]).to.deep.equal([true, 1, ['b.json'], new DirectoryPath(root), false]);
  });

  it('says why it could not listen on a busy port and fails, trying no other', async () => {
    const holder = await occupied('127.0.0.1');
    const where = fixedPlace('localhost', portOf(holder));

    const result = await new MockServeAction().execute(optionsWith({ listen: where })).finally(() => released(holder));

    const [refusedAt, reason] = prompts.notListening.firstCall.args;
    expect([result.isFailed(), refusedAt, reason.includes('already in use'), prompts.mockServed.called]).to.deep.equal([
      true,
      where,
      true,
      false
    ]);
  });
});
