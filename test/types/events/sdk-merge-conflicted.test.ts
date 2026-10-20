import { expect } from 'chai';
import { SdkMergeConflictedEvent } from '../../../src/types/events/sdk-merge-conflicted.js';

describe('SdkMergeConflictedEvent', () => {
  it('carries the counts by kind and the flag names, and no file', () => {
    const event = new SdkMergeConflictedEvent({ bothChanged: 2, noLongerGenerated: 1 }, 'sdk generate', {
      language: 'python',
      force: true
    });

    expect(JSON.parse(JSON.stringify(event))).to.deep.equal({
      eventName: 'SdkMergeConflictedEvent',
      message: 'Regeneration left 3 conflicted files.',
      commandName: 'sdk generate',
      flags: ['language', 'force'],
      conflicts: { bothChanged: 2, noLongerGenerated: 1 }
    });
  });

  it('counts one file in the singular', () => {
    const event = new SdkMergeConflictedEvent({ binary: 1 }, 'sdk generate', {});

    expect(JSON.parse(JSON.stringify(event)).message).to.equal('Regeneration left 1 conflicted file.');
  });
});
