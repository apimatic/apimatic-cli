import { DomainEvent } from "./domain-event.js";

export class QuickstartCompletedEvent extends DomainEvent {
  protected readonly eventName = QuickstartCompletedEvent.name;

  constructor(message: string, commandName: string, flags: Record<string, unknown>) {
    super(message, commandName, flags);
  }
}
