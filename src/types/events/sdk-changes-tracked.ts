import { DomainEvent } from "./domain-event.js";

export class SdkChangesTrackedEvent extends DomainEvent {
  protected readonly eventName = SdkChangesTrackedEvent.name;
  private static readonly message = "SDK generated with track changes enabled." as const;
  private static readonly commandName = "sdk:generate" as const;
  private readonly language: string;

  constructor(language: string) {
    super(SdkChangesTrackedEvent.message, SdkChangesTrackedEvent.commandName, {});
    this.language = language;
  }
}
