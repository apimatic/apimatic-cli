import { DomainEvent } from "../../types/common/tracking-event.js";

export class RecipeCreationFailedEvent extends DomainEvent {
  protected readonly eventName = "RecipeCreationFailed" as const;
  protected readonly commandName = "portal:recipe:new";

  constructor(message: string, flags: Record<string, unknown>) {
    super(message, flags);
  }
}
