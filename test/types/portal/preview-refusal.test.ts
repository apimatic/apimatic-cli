import { expect } from 'chai';
import { PreviewRefusal } from '../../../src/types/portal/preview-refusal';

describe('PreviewRefusal', () => {
  it('is fixed by the first save accepted after a refusal, and by no other', () => {
    const refusal = new PreviewRefusal();
    expect(refusal.accept()).to.be.false;

    refusal.refuse();
    refusal.refuse();

    expect(refusal.accept()).to.be.true;
    expect(refusal.accept()).to.be.false;
  });
});
