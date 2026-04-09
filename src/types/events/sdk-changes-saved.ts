import { DomainEvent } from "./domain-event.js";

export class SdkChangesSavedEvent extends DomainEvent {
  protected readonly eventName = SdkChangesSavedEvent.name;
  private static readonly message = "Save changes completed." as const;
  private static readonly commandName = "sdk:save-changes" as const;
  private readonly language: string;

  constructor(language: string) {
    super(SdkChangesSavedEvent.message, SdkChangesSavedEvent.commandName, {});
    this.language = language;
  }
}
