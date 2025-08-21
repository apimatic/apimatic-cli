import { DomainEvent } from "./domain-event.js";

export class QuickstartInitiatedEvent extends DomainEvent {
  protected readonly eventName = QuickstartInitiatedEvent.name;
  private static readonly message = "Quickstart initiated." as const;
  private static readonly commandName = "portal quickstart" as const;

  constructor() {
    super(QuickstartInitiatedEvent.message, QuickstartInitiatedEvent.commandName, {});
  }
}
