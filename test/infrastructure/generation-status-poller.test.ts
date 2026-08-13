import { expect } from 'chai';
import sinon from 'sinon';
import { ok, Result } from 'neverthrow';
import { pollUntilCompleted } from '../../src/infrastructure/generation-status-poller';
import { ServiceError, ServiceErrorCode } from '../../src/infrastructure/service-error';

// The service suites reach the timeout with millisecond budgets, which only ever renders the
// sub-minute wording. The message a user actually sees is built from a production budget, so
// the minute branches are exercised here over a fake clock rather than in real time.
describe('pollUntilCompleted', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  const neverFinishes = async (): Promise<Result<{ status: string }, ServiceError>> => ok({ status: 'InProgress' });

  const timeoutAfter = async (budgetMs: number, label: string) => {
    const polling = pollUntilCompleted({
      pollIntervalMs: 1000,
      fetchStatus: neverFinishes,
      timeout: { budgetMs, label }
    });
    await clock.tickAsync(budgetMs + 1000);
    const result = await polling;

    expect(result.isErr(), 'a run that never finishes should time out').to.be.true;
    const error = result._unsafeUnwrapErr();
    expect(error.code).to.equal(ServiceErrorCode.Timeout);
    return error.errorMessage;
  };

  it('names the budget in minutes', async () => {
    expect(await timeoutAfter(5 * 60_000, 'Plugin generation')).to.equal('Plugin generation timed out after 5 minutes.');
  });

  it('says minute rather than minutes for a one-minute budget', async () => {
    expect(await timeoutAfter(60_000, 'Portal generation')).to.equal('Portal generation timed out after 1 minute.');
  });

  it('omits the duration when the budget is under a minute', async () => {
    expect(await timeoutAfter(15, 'SDK generation')).to.equal('SDK generation timed out.');
  });

  it('rounds down to whole minutes', async () => {
    expect(await timeoutAfter(90_000, 'Portal generation')).to.equal('Portal generation timed out after 1 minute.');
  });
});
