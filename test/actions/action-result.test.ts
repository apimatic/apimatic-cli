import { expect } from 'chai';
import { ActionResult } from '../../src/actions/action-result';

describe('ActionResult', () => {
  it('carries the error a failure was given, beside its message', () => {
    const result = ActionResult.failed('Validation failed', 'invalid');

    expect(result.isFailed()).to.be.true;
    expect(result.getError()).to.equal('invalid');
    expect(result.getMessage()).to.equal('Validation failed');
    expect(result.getExitCode()).to.equal(1);
  });

  it('keeps the default message on a failure given only an error', () => {
    const result = ActionResult.failed(undefined, 'unchecked');

    expect(result.getMessage()).to.equal('Failed');
    expect(result.getError()).to.equal('unchecked');
  });

  it('has no error on a failure given none, a success or a cancellation', () => {
    expect(ActionResult.failed().getError()).to.be.undefined;
    expect(ActionResult.success().getError()).to.be.undefined;
    expect(ActionResult.cancelled().getError()).to.be.undefined;
  });

  it('is neither a failure nor a cancellation when action is required, yet exits 1 as git merge does on conflicts', () => {
    const result = ActionResult.actionRequired();

    expect(result.isActionRequired()).to.be.true;
    expect(result.isFailed()).to.be.false;
    expect(result.isCancelled()).to.be.false;
    expect(result.isSuccess()).to.be.false;
    expect(result.getMessage()).to.equal('Action required');
    expect(result.getExitCode()).to.equal(1);
    expect(
      result.mapAll(
        () => 'success',
        () => 'failure',
        () => 'cancel',
        () => 'actionRequired'
      )
    ).to.equal('actionRequired');
  });

  it('keeps 130 for a cancellation and 0 for a success', () => {
    expect(ActionResult.cancelled().getExitCode()).to.equal(130);
    expect(ActionResult.success().getExitCode()).to.equal(0);
  });

  it('drops the error along with the value', () => {
    const result = ActionResult.failed(undefined, 'invalid').discardValue();

    expect(result.isFailed()).to.be.true;
    expect(result.getError()).to.be.undefined;
  });
});
