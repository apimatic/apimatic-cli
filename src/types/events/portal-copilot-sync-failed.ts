import { DomainEvent } from './domain-event.js';

export class PortalCopilotSyncFailedEvent extends DomainEvent {
  protected readonly eventName = PortalCopilotSyncFailedEvent.name;

  constructor(message: string, commandName: string, flags: Record<string, unknown>) {
    super(message, commandName, flags);
  }
}
