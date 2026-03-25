import { DomainEvent } from "./domain-event.js";

export class SdkTrackChangesEvent extends DomainEvent {
  protected readonly eventName = SdkTrackChangesEvent.name;
  private static readonly message = "SDK generated with track changes enabled." as const;
  private static readonly commandName = "sdk:generate" as const;

  constructor(flags: Record<string, unknown>) {
    super(SdkTrackChangesEvent.message, SdkTrackChangesEvent.commandName, SdkTrackChangesEvent.flattenFlags(flags));
  }

  private static flattenFlags(flags: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(flags).map(([key, value]) => [`${key}=${value}`, true]));
  }
}
