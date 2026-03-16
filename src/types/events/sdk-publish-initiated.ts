import { DomainEvent } from './domain-event.js';

export class SdkPublishInitiatedEvent extends DomainEvent {
  protected readonly eventName = SdkPublishInitiatedEvent.name;
  private static readonly message = 'SDK Publish initiated.' as const;
  private static readonly commandName = 'sdk publish' as const;

  constructor() {
    super(SdkPublishInitiatedEvent.message, SdkPublishInitiatedEvent.commandName, {});
  }
}
