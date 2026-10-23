import { DomainEvent } from './domain-event.js';

export class PortalCopilotDisableFailedEvent extends DomainEvent {
  protected readonly eventName = PortalCopilotDisableFailedEvent.name;

  constructor(message: string, commandName: string, flags: Record<string, unknown>) {
    super(message, commandName, flags);
  }
}
