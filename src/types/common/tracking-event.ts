export abstract class DomainEvent {
  protected abstract readonly eventName: string;
  protected abstract readonly commandName: string;
  private readonly message: string;
  private readonly flags: Record<string, string>;

  constructor(message: string, flags: Record<string, unknown>) {
    this.message = message;
    this.flags = this.redactFlags(flags);
  }

  private redactFlags(flags: Record<string, unknown>): Record<string, string> {
    const redactedFlags: Record<string, string> = {};
    for (const key in flags) {
      redactedFlags[key] = "REDACTED";
    }
    return redactedFlags;
  }
}
