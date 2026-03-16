import { DomainEvent } from "./domain-event.js";

export class SdkConflictsDetectedEvent extends DomainEvent {
  protected readonly eventName = SdkConflictsDetectedEvent.name;
  private static readonly message = "SDK merge conflicts detected." as const;
  private static readonly commandName = "sdk:generate" as const;

  constructor(flags: Record<string, unknown>) {
    super(SdkConflictsDetectedEvent.message, SdkConflictsDetectedEvent.commandName, SdkConflictsDetectedEvent.flattenFlags(flags));
  }

  private static flattenFlags(flags: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(flags).map(([key, value]) => [`${key}=${value}`, true]));
  }
}
