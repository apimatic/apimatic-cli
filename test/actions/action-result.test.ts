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

  it('drops the error along with the value', () => {
    const result = ActionResult.failed(undefined, 'invalid').discardValue();

    expect(result.isFailed()).to.be.true;
    expect(result.getError()).to.be.undefined;
  });
});
