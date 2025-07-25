export abstract class DomainEvent {
  protected abstract readonly eventName: string;
  private readonly message: string;
  private readonly flags: object;

  constructor(message: string, flags: object) {
    this.message = message;
    this.flags = flags;
  }
}