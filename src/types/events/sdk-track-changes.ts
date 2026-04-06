import { DomainEvent } from "./domain-event.js";

export class SdkTrackChangesEvent extends DomainEvent {
  protected readonly eventName = SdkTrackChangesEvent.name;
  private static readonly message = "SDK generated with track changes enabled." as const;
  private static readonly commandName = "sdk:generate" as const;
  private readonly language: string;

  constructor(language: string) {
    super(SdkTrackChangesEvent.message, SdkTrackChangesEvent.commandName, {});
    this.language = language;
  }
}
