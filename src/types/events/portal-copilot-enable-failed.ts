import { DomainEvent } from './domain-event.js';

export class PortalCopilotEnableFailedEvent extends DomainEvent {
  protected readonly eventName = PortalCopilotEnableFailedEvent.name;

  constructor(message: string, commandName: string, flags: Record<string, unknown>) {
    super(message, commandName, flags);
  }
}
