# Interactive `sdk publish` — poll for publish completion

Design notes for the change on `fix/interactive-sdk-publish-polling` (commit `cd38dd0`, branched from `origin/dev` at `0a2ef4b`). Written 2026-08-10.

## Problem

The two modes of `apimatic sdk publish` disagreed about when the command was done.

- **Interactive** (`actions/sdk/publish/interactive.ts`) returned as soon as the publishing API accepted the POST. It printed `sdkPublishingInProgress` — "To view the **status** of publishing, please visit…" — and returned `success()`, so the command exited `0` whether publishing later succeeded or failed.
- **Non-interactive** (`actions/sdk/publish/non-interactive.ts`) printed `publishingRunningNotice`, polled `getSdkPublishingLog` every 10 s to a terminal state, printed `postPublishingMessage`, and returned `failed()` when publishing did not succeed.

`pollPublishingStatus` lived only on `SdkPublishNonInteractivePrompts`, even though a shared `SdkPublishPrompts` and a shared `SdkPublishAction` already existed and both modes went through them.

## Decisions

Each was decided explicitly; the rationale matters more than the choice.

1. **Polling lives in the shared `SdkPublishAction`**, not duplicated per mode and not left as a shared prompt method that each mode action drives. Both modes did an identical post-POST sequence, so sharing the orchestration is what actually prevents the two paths drifting again. The poll runs *after* the `withDirPath` block closes, so the temp directory holding the zipped SDK is released before the CLI sits waiting for minutes.

2. **The running notice prints in both modes.** Interactive already shows `publishingSummary` before `confirmPublishing`, so the four fields (profile / language / version / targets) appear twice — but a full SDK generation scrolls by in between, and suppressing it for interactive would mean threading a mode flag into the shared action. That flag is the first crack that lets the modes diverge.

3. **One closing note, both outcomes**, reusing non-interactive's `postPublishingMessage` wording verbatim. The log URL is useful on success (package/repo links) and essential on failure. Interactive's `sdkPublishingInProgress` was deleted — publishing is no longer in flight when the command exits, so its wording had become wrong.

4. **Ctrl+C mid-poll cancels the wait and exits 130**, printing "publishing is still running on APIMatic" plus the log URL. This also fixed a live bug — see below.

5. **The completion predicate was left exactly as it was.** `events.every(...)` is vacuously true on an empty array, so an empty or partially-populated publish log reports instant false success. No guard was added, deliberately: see [#312](https://github.com/apimatic/apimatic-cli/issues/312).

6. **Transient status-fetch errors still abort the poll** on the first failure. The message already distinguishes "Failed to fetch publishing status." from a publish failure, the log URL prints regardless, and a non-zero exit is honest because the CLI genuinely does not know the outcome. Retry tolerance is noted on #312.

7. **The poll loop stays in the prompts layer**, moved verbatim into shared `SdkPublishPrompts`. `.ai/instructions.md` scopes prompts to terminal UI, and `infrastructure/services/portal-service.ts` has a `pollUntilCompleted` precedent for service-owned polling — but relocating the loop means inventing a status-callback seam across a layer boundary, which is a refactor riding along on a parity fix.

8. **No timeout.** Any ceiling is a guess about the slowest legitimate publish, and guessing low turns a slow success into a reported failure. Ctrl+C is the interactive escape hatch; job timeouts are the CI one.

9. **No automated tests.** `test/` has no publish coverage and no prompts tests at all. Meaningful coverage here needs either fake timers plus stdout capture against a live clack spinner, or dependency injection into `SdkPublishAction` (which constructs its own `SdkPublishPrompts`, `PublishingApiService`, and `GenerateAction`). Either is larger and riskier than the parity fix. Verified manually instead.

10. **`SdkPublishAction.execute` returns `Promise<ActionResult>`**, not `ActionResult<PublishingInfo>`. Nothing reads the payload now that the action prints its own notes, and the old signature carried a hazard: the dry-run branch returns `ActionResult.success()` with no value, so `getValue()` on it throws. That was safe only because interactive hardcoded `dryRun: false`.

11. **`pollPublishingStatus` returns `'succeeded' | 'failed' | 'cancelled'`**, exported from the prompts module (following `QuickstartFlow` in `prompts/quickstart.ts`). A boolean cannot express cancel-vs-fail, and keeping them distinct matters for planned work: a future PR will write a `plugin-config.json` recording successfully published packages, and its cancel path will need to warn that abandoning the wait breaks context-plugin generation. `ActionResult` stays out of the prompts layer.

12. **The poller returns the outcome only**, not the terminal `PublishLogEventItem[]`. That data (`packageUrl`, `sourceUrl`, `languageVersion`) is what `plugin-config.json` will be built from, but that PR knows which fields it needs and where the write belongs; widening one internal method with two call sites is cheap later.

13. **The cancel message stays generic** — publishing continues server-side, here is the log URL. Naming `plugin-config.json` before the CLI writes it would point users at nothing.

Two smaller calls, made without discussion: `sourceCodeOnlyPublishingNotice` stays duplicated in both mode prompt classes (both mode *actions* call it before the shared action runs, so consolidating it is unrelated cleanup), and the methods moved to `SdkPublishPrompts` were removed from `SdkPublishNonInteractivePrompts` rather than left as forwarding wrappers.

## The cancellation bug

Worth recording because it is not obvious from the clack API, and because the first attempt at it was wrong.

`@clack/prompts@1.0.0-alpha.1`'s **spinner** contains no `process.exit`. On SIGINT it stops the spinner (printing its cancel line), calls an optional `onCancel`, sets `isCancelled`, and removes its own signal listeners. That reading is correct as far as it goes, and it is what the first fix (commit `cd38dd0`) was built on: pass `onCancel` to `spinner()` to flag cancellation and clear the pending 10 s `setTimeout`, then return **without** calling `spin.stop()` again.

That fix never ran. `spin.start()` calls `block()` from `@clack/core`, which puts stdin in raw mode and registers a **keypress** listener that calls **`process.exit(0)`** as soon as it sees a key aliased to `cancel` — `\x03` (Ctrl+C) or `escape`. Raw mode also stops the terminal from raising SIGINT at all, so on Ctrl+C:

1. `block()`'s keypress listener calls `process.exit(0)` synchronously.
2. The spinner's `process.on('exit')` listener fires with code `0`, so it prints its cancel line with the **green submit symbol** (`◇  Canceled`, not red `■`) and, because that path sets `isCancelled = false`, **never calls `onCancel`**.
3. The process is gone. `pollPublishingStatus` never returns, the running notice and log URL never print, and the CLI reports **exit code 0** for an abandoned publish.

The `◇` rather than `■` in a bug report is the tell that this path, not SIGINT, was taken.

Because clack offers no way to opt out of `block()` (`spinner()` takes `output` and `signal`, never `input`) and `updateSettings` can only *add* key aliases, never remove them, the only seam left is to take the key back. `startCancellableSpinner` in `src/prompts/prompt.ts` starts the spinner, diffs stdin's `keypress` listeners against a snapshot taken before `start()` to remove exactly the one `block()` added, and installs its own Ctrl+C listener that flags cancellation and aborts the pending timer. `dispose()` in a `finally` removes it again.

Consequences worth knowing:

- **The poll now stops its own spinner.** With clack's hard exit gone, nothing prints a cancel line, so the cancelled branch calls `spin.stop(...)` itself — guarded by `if (!spin.isCancelled)`, because SIGTERM still reaches clack's own handler, which prints and tears down first. Both paths therefore produce exactly one cancel line.
- **`spin.stop()` still performs teardown** (cursor restore, raw mode off, readline close) via the unblock closure `block()` returned, which is untouched.
- **Escape no longer aborts the wait.** It used to, by falling into the same `process.exit(0)`; only Ctrl+C is honoured now, which is the documented escape hatch anyway.
- **Keystrokes during the wait are no longer erased.** `block()`'s listener also redrew over stray input; the spinner's own 80 ms repaint (`\x1b[999D\x1b[J`) already covers same-line garbage, so the only visible artifact is one stale spinner line per Enter press.

## Files touched

| File | Change |
| --- | --- |
| `src/prompts/prompt.ts` | New `startCancellableSpinner` — a spinner whose Ctrl+C is observable rather than fatal (see the cancellation bug) |
| `src/prompts/sdk/publish.ts` | Shared prompts gain `publishingRunningNotice`, `postPublishingMessage`, `publishingWaitCancelledNotice`, `pollPublishingStatus`, and `export type PublishingOutcome` |
| `src/actions/sdk/publish.ts` | Polls after `withDirPath` closes; maps outcome to `ActionResult`; return type narrowed to `Promise<ActionResult>` |
| `src/actions/sdk/publish/interactive.ts` | Dropped the fire-and-forget note; now only inspects the result |
| `src/actions/sdk/publish/non-interactive.ts` | Poll/notice/note block removed (moved into the shared action); behaviour unchanged |
| `src/prompts/sdk/publish/interactive.ts` | `sdkPublishingInProgress` deleted, unused imports pruned |
| `src/prompts/sdk/publish/non-interactive.ts` | Moved methods deleted, unused imports pruned |

## Deferred

- [#312](https://github.com/apimatic/apimatic-cli/issues/312) — missing array-length check makes an empty publish log report a false success; also carries the no-retry-tolerance and unbounded-wait notes.
- [#313](https://github.com/apimatic/apimatic-cli/issues/313) — no telemetry for publishes that fail *after* being accepted. `SdkPublishValidationFailedEvent` models a rejected publish request; folding remote failures into it would corrupt that metric, so it wants its own event.
- Every other long wait behind `withSpinner` still has clack's `process.exit(0)` on Ctrl+C: portal generation (`pollUntilCompleted` in `infrastructure/services/portal-service.ts`) and the device-code login loop (`actions/auth/login.ts`). They exit `0` with a green `◇ cancelled` and no notice. `startCancellableSpinner` is the seam to fix them with; not done here because each needs its own decision about what to print and return on cancel.

## Verification

Automated: `pnpm build` and `pnpm lint` clean; `pnpm apimatic sdk publish --help` loads from the built output.

Manual matrix (requires a real publishing profile):

1. Interactive, Package + Source Code → polls to `[Published] | [Published]`, exit `0`.
2. Interactive, package-only → one target in the status line.
3. Interactive, a publish that fails → exit `1`, log URL printed.
4. Interactive, Ctrl+C mid-poll → immediate `■ Cancelled waiting for publishing status.`, "still running" notice, log URL, exit `130`. Verified by driving `pollPublishingStatus` from the built output in a child process and writing `\x03` to its stdin: it returns `'cancelled'`, the caller's notices print, and the process exits `130`. Before the fix the same harness died at `process.exit(0)` with nothing after the cancel line.
5. Interactive, Ctrl+C pressed repeatedly → one cancel line, one notice, exit `130`; the replacement listener is idempotent and nothing hard-exits. Verified in the same harness with three `\x03` writes.
6. Non-interactive regression → output unchanged from before this change.
