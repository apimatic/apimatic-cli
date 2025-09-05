import { DomainEvent } from "./domain-event.js";

export class TocCreationFailedEvent extends DomainEvent {
  protected readonly eventName = TocCreationFailedEvent.name;

  constructor(message: string, commandName: string, flags: Record<string, unknown>) {
    super(message, commandName, flags);
  }
}
