import { DomainEvent } from "../../types/common/tracking-event.js";

export class TocCreationFailedEvent extends DomainEvent {
    protected readonly eventName = "TocCreationFailed" as const;

    constructor(message: string, flags: Record<string, unknown>) { 
        super(message, flags);
    }
}