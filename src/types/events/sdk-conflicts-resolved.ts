import { DomainEvent } from "./domain-event.js";

export class SdkConflictsResolvedEvent extends DomainEvent {
  protected readonly eventName = SdkConflictsResolvedEvent.name;
  private static readonly message = "SDK merge conflicts resolved." as const;
  private static readonly commandName = "sdk:generate" as const;

  constructor(flags: Record<string, unknown>) {
    super(SdkConflictsResolvedEvent.message, SdkConflictsResolvedEvent.commandName, flags);
  }
}
