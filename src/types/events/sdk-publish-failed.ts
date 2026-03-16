import { DomainEvent } from './domain-event.js';

export class SdkPublishFailedEvent extends DomainEvent {
  protected readonly eventName = SdkPublishFailedEvent.name;

  constructor(message: string, commandName: string, flags: Record<string, unknown>) {
    super(message, commandName, flags);
  }
}
