export abstract class DomainEvent {
  protected abstract readonly eventName: string;
  private readonly message: string;
  private readonly commandName: string;
  private readonly flags: Record<string, unknown>;

  protected constructor(message: string, commandName: string, flags: Record<string, unknown>) {
    this.message = message;
    this.commandName = commandName;
    this.flags = flags;
  }
}

