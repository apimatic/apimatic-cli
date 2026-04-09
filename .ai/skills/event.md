# Domain Event Conventions

Domain events live at `src/types/events/` and represent something that **already happened** in the system. They are fired from the Command layer via `TelemetryService.trackEvent()` and extend `DomainEvent`.

## Conventions

### Naming

- **Class name must be past tense** — the event describes something that occurred: `QuickstartCompleted`, `SdkChangesSaved`, `RecipeCreationFailed`. Never present tense (`SdkSaveChanges`) or imperative (`SaveChanges`).
- **File name** — lowercase hyphenated, matching the class name: `quickstart-completed.ts`, `sdk-changes-saved.ts`.
- **Class name suffix** — always `Event`: `QuickstartCompletedEvent`, `SdkChangesSavedEvent`.

### Structure

Two variants exist depending on whether the event carries runtime data (e.g., `language`) or is parameterised entirely by its own static fields.

#### Self-contained event (no runtime data beyond what the event already knows)

```typescript
import { DomainEvent } from "./domain-event.js";

export class {PascalName}Event extends DomainEvent {
  protected readonly eventName = {PascalName}Event.name;
  private static readonly message = "{Human readable past-tense description}." as const;
  private static readonly commandName = "{topic}:{command}" as const;

  constructor() {
    super({PascalName}Event.message, {PascalName}Event.commandName, {});
  }
}
```

#### Event with runtime payload (e.g., language, flags)

```typescript
import { DomainEvent } from "./domain-event.js";

export class {PascalName}Event extends DomainEvent {
  protected readonly eventName = {PascalName}Event.name;
  private static readonly message = "{Human readable past-tense description}." as const;
  private static readonly commandName = "{topic}:{command}" as const;
  private readonly {payloadField}: {PayloadType};

  constructor({payloadField}: {PayloadType}) {
    super({PascalName}Event.message, {PascalName}Event.commandName, {});
    this.{payloadField} = {payloadField};
  }
}
```

#### Failure event (message, commandName, and flags passed in from the Command layer)

Use this variant when the event needs to capture dynamic failure context (e.g., the failing command's flags):

```typescript
import { DomainEvent } from "./domain-event.js";

export class {PascalName}Event extends DomainEvent {
  protected readonly eventName = {PascalName}Event.name;

  constructor(message: string, commandName: string, flags: Record<string, unknown>) {
    super(message, commandName, flags);
  }
}
```

### DO

- **DO** use past-tense names: `Completed`, `Initiated`, `Failed`, `Resolved`, `Saved`, `Tracked`.
- **DO** mark `message` and `commandName` as `private static readonly ... as const`.
- **DO** assign `eventName` as `protected readonly eventName = {ClassName}.name` — never a raw string.
- **DO** use named export: `export class {PascalName}Event`.
- **DO** place the file at `src/types/events/{kebab-name}.ts`.
- **DO** use `.js` extension in the import: `import { DomainEvent } from "./domain-event.js"`.
- **DO** fire events from the Command layer only — never from Actions or Services.
- **DO** fire success events inside the `mapAll` success callback (first arg); failure events in the failure callback (second arg).

### DON'T

- **DON'T** use present tense or imperative class names (`SdkSaveChanges`, `TrackChanges`).
- **DON'T** use `export default`.
- **DON'T** fire events from Actions, Prompts, or Infrastructure — only from Commands.
- **DON'T** add business logic inside an event class — it is a plain data carrier.

---

## Review Checklist

- [ ] Class name is past tense and ends with `Event`
- [ ] File name is kebab-case and matches the class name
- [ ] `eventName` assigned as `ClassName.name` (not a raw string)
- [ ] `message` and `commandName` are `private static readonly ... as const` (self-contained variant)
- [ ] Named export (not default)
- [ ] Import uses `.js` extension: `"./domain-event.js"`
- [ ] Fired from Command layer only, inside `result.mapAll(...)` callback

---

## Reference Files

| Pattern | File |
|---|---|
| Self-contained success event (no payload) | `src/types/events/quickstart-completed.ts` |
| Self-contained initiation event (no payload) | `src/types/events/quickstart-initiated.ts` |
| Success event with payload (`language`) | `src/types/events/sdk-changes-saved.ts` |
| Success event with payload (`language`) | `src/types/events/sdk-conflicts-resolved.ts` |
| Failure event (dynamic message + flags) | `src/types/events/recipe-creation-failed.ts` |
| DomainEvent base class | `src/types/events/domain-event.ts` |
| Firing from Command (success + failure) | `src/commands/quickstart.ts` |
| Firing from Command (failure only) | `src/commands/portal/recipe/new.ts` |
