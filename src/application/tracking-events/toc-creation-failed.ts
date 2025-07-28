import { DomainEvent } from "../../types/common/tracking-event.js";

export class TocCreationFailedEvent extends DomainEvent {
  protected readonly eventName = "TocCreationFailed" as const;
  protected readonly commandName = "portal:toc:new";

  constructor(message: string, flags: Record<string, unknown>) {
    super(message, flags);
  }
}
