import { DomainEvent } from './domain-event.js';

/** A regeneration that left conflicts: how many of each kind, never which files. */
export class SdkMergeConflictedEvent extends DomainEvent {
  protected readonly eventName = SdkMergeConflictedEvent.name;
  private readonly conflicts: Readonly<Record<string, number>>;

  constructor(conflicts: Readonly<Record<string, number>>, commandName: string, flags: Record<string, unknown>) {
    const total = Object.values(conflicts).reduce((sum, count) => sum + count, 0);
    super(`Regeneration left ${total} conflicted file${total === 1 ? '' : 's'}.`, commandName, flags);
    this.conflicts = conflicts;
  }
}
