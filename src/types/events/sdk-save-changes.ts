import { DomainEvent } from "./domain-event.js";

export class SdkSaveChangesEvent extends DomainEvent {
  protected readonly eventName = SdkSaveChangesEvent.name;
  private static readonly message = "Save changes completed." as const;
  private static readonly commandName = "sdk:save-changes" as const;
  private readonly language: string;;

  constructor(language: string) {
    super(SdkSaveChangesEvent.message, SdkSaveChangesEvent.commandName, {});
    this.language = language;
  }
}
