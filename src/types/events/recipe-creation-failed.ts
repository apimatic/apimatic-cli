import { DomainEvent } from "../../types/events/domain-event.js";

export class RecipeCreationFailedEvent extends DomainEvent {
  protected readonly eventName = RecipeCreationFailedEvent.name;

  constructor(message: string, commandName: string, flags: Record<string, unknown>) {
    super(message, commandName, flags);
  }
}
