import { DomainEvent } from "./domain-event.js";

export class QuickstartCompletedEvent extends DomainEvent {
  protected readonly eventName = QuickstartCompletedEvent.name;
  private static readonly message = "Quickstart completed." as const;
  private static readonly commandName = "portal:quickstart" as const;

  constructor() {
    super(QuickstartCompletedEvent.message, QuickstartCompletedEvent.commandName, {});
  }
}
