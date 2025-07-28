import { DomainEvent } from "../../types/common/tracking-event.js";

export class RecipeCreationFailedEvent extends DomainEvent {
  protected readonly eventName = "RecipeCreationFailed" as const;

  constructor(message: string, flags: Record<string, unknown>) {
    super(message, flags);
  }
}
