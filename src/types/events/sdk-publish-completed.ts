import { DomainEvent } from './domain-event.js';

export class SdkPublishCompletedEvent extends DomainEvent {
  protected readonly eventName = SdkPublishCompletedEvent.name;
  private static readonly message = 'SDK Publish completed.' as const;
  private static readonly commandName = 'sdk publish' as const;

  constructor() {
    super(SdkPublishCompletedEvent.message, SdkPublishCompletedEvent.commandName, {});
  }
}
