import { DomainEvent } from "./domain-event.js";

export class SaveChangesCompletedEvent extends DomainEvent {
  protected readonly eventName = SaveChangesCompletedEvent.name;
  private static readonly message = "Save changes completed." as const;
  private static readonly commandName = "sdk:save-changes" as const;

  constructor(flags: Record<string, unknown>) {
    super(SaveChangesCompletedEvent.message, SaveChangesCompletedEvent.commandName, SaveChangesCompletedEvent.flattenFlags(flags));
  }

  private static flattenFlags(flags: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(flags).map(([key, value]) => [`${key}=${value}`, true]));
  }
}
