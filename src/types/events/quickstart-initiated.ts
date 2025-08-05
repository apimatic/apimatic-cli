import { DomainEvent } from "./domain-event.js";

export class QuickstartInitiatedEvent extends DomainEvent {
  protected readonly eventName = QuickstartInitiatedEvent.name;

  constructor(message: string, commandName: string, flags: Record<string, unknown>) {
    super(message, commandName, flags);
  }
}
