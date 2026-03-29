import { DomainEvent } from './domain-event.js';

export class SdkPublishValidationFailedEvent extends DomainEvent {
  protected readonly eventName = SdkPublishValidationFailedEvent.name;

  constructor(message: string, commandName: string, flags: Record<string, unknown>) {
    super(message, commandName, flags);
  }
}
