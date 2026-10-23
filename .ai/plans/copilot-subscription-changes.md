# Ask AI subscription checks and key registration: CLI changes

Branch: `feat/portal-copilot-subscription`, stacked on `feat/portal-ai-copilot` (PR #438). Not committed yet.
Service side: branch `feat/platform-subscription` in `apimatic-chatbot-service`, described in that repo's `.ai/plans/platform-subscription-changes.md`.
Decisions and the Q&A behind them: [copilot-subscription.md](copilot-subscription.md).

## The task

A portal's Ask AI chat needed three things it did not have:

1. **A key the CLI creates and registers.** Until now, a Copilot key came from the service's admin tool, and a developer copied it into `apimatic.json` by hand along with the service address (`apiUrl`).
2. **A subscription check.** Ask AI should only be available on plans that include it (the platform's `AiChatBot` feature, `isApiCopilotAllowed` on `/account/profile`), just as portal generation is only available on plans with on-prem generation. Nothing checked the plan: not `generate`, not `copilot sync`, not the service.
3. **A service address that the project's own file can't choose.** `apiUrl` in `apimatic.json` let a project, including a third party's, send the user's saved login to any server.

## What changed

### New commands

**`apimatic portal copilot enable`** turns Ask AI on for a portal project.

| Flag | Meaning |
|---|---|
| `--dev` | Generates a `pk_dev_` key, which works on `localhost` (for `portal serve`) and is capped at 200 questions a day. Without it, `pk_live_`. |
| `--rotate` | Issues a new key. The old one is revoked only after the new one is saved. |
| `--origin <url>` (repeatable) | Extra websites the chat may run on, besides the origin of `portal.site.url`. |
| `-i`, `-k` | The project folder and an auth key, as in other commands. |

What it does, in order:
1. Reads the `portal` block of `src/apimatic.json`.
2. Works out the service address.
3. Builds the registration: the name from `site.name`, `siteUrl` from `site.url`, and the allowed origins. A live key with no origin is refused.
4. Picks the key: a new one if there's none (or with `--rotate`), otherwise the existing one, re-registered so changed origins reach the service.
5. Checks the subscription.
6. Calls `PUT /v1/portals`.
7. Writes `portal.ai.copilot.key` into `apimatic.json`. If that write fails, the key is printed so it can be added by hand.

Running `enable` again updates the registration of the existing key.

**`apimatic portal copilot disable`** revokes the key with the service and removes `portal.ai.copilot` from `apimatic.json` (and the `ai` block if it ends up empty). It doesn't check the subscription, so an account whose plan lapsed can still revoke.

### Subscription checks in existing commands

- **`portal generate` and `portal serve`/`quickstart`**, which share `prepare-project`: when `apimatic.json` has a `copilot` block and the plan has no Ask AI, the build stops and says why, with a pricing link and how to build without the chat. The check reuses the profile request the on-prem check already makes, so it adds no extra request.
- **`portal copilot sync`** checks the plan before uploading.
- **`portal generate`** warns when the portal is built with a `pk_dev_` key, which only works on `localhost`.
- Every check fails closed: if the platform can't be reached, the work doesn't go ahead (as with portal generation today).

### The service address

- `apiUrl` is removed from `portal.ai.copilot` (the parser and `apimatic.schema.json`). An old file that still has it gets the usual unknown-setting message.
- The address is `https://ask.apimatic.io` (a placeholder until the service is deployed), or whatever `APIMATIC_COPILOT_URL` names, much like `APIMATIC_BASE_URL` does for the platform.
- Any `https://` address is accepted, or `http(s)://` on loopback. The old "apimatic.io only" rule guarded against a project's file; the address now comes from the user's own environment, and the old rule would have refused a dev deployment on its own domain.
- `portal generate` writes the address into the portal, so a portal built against the dev service talks to the dev service.

### Supporting changes

| Area | Change | Files |
|---|---|---|
| Subscription | `SubscriptionInfo` reads `isApiCopilotAllowed`. A new `AccountEntitlements` value object holds what the plan allows. `PortalAuthorizationService.authorize` now returns the entitlements, and the new `authorizeAskAi` checks for Ask AI. A refusal names the missing feature. | `src/types/api/account.ts`, `src/types/api/account-entitlements.ts`, `src/infrastructure/services/portal-authorization-service.ts`, `src/prompts/portal/authorization.ts` |
| Keys | `CopilotKey` (generated with `crypto.randomBytes` in the service's `pk_live_`/`pk_dev_` format) and `CopilotRegistration` value objects. `PortalSourceContext.writeCopilotKey` edits `apimatic.json`. | `src/types/portal/copilot/`, `src/types/portal-source-context.ts` |
| Service client | `CopilotPortalService` (`register`, `revoke`), with the error mapping shared with ingest in `copilot-responses.ts`. Refusals show the service's own message for 400/409/413/429. | `src/infrastructure/services/copilot-portal-service.ts`, `copilot-responses.ts`, `copilot-ingest-service.ts` |
| Login | A shared `resolveAuthKey` (`-k`, else the saved login) for `enable`, `disable` and `sync`. | `src/client-utils/auth-manager.ts` |
| Telemetry | `PortalCopilotEnableFailedEvent`, `PortalCopilotDisableFailedEvent`. | `src/types/events/` |
| Docs | README regenerated for the new commands; the `portal:copilot` topic description updated. | `README.md`, `package.json` |

### Tests

New: `enable` and `disable` actions, the `enable` flags and prompts, `CopilotKey`, `CopilotRegistration` and `CopilotPortalService`. Updated: `sync`, `generate`, `prepare-project`, `serve`, `quickstart`, the authorization service, the service address and the schema. The platform and the service are mocked with sinon and nock.

Results (2026-10-23): `pnpm build` passes; `pnpm test` gives 2133 passing and 83 pending (the e2e tests are skipped by default); `eslint .` is clean; the e2e portal build tests (`APIMATIC_E2E=1`) give 77 passing.

## How the two sides fit

```
apimatic portal copilot enable
  ├─ CLI: GET /account/profile        → isApiCopilotAllowed? (refuse early, with a pricing link)
  ├─ CLI: PUT /v1/portals             → the service asks the platform again with the same auth key,
  │                                     records the plan, and registers the key under the tenant
  └─ CLI: writes portal.ai.copilot.key into src/apimatic.json
apimatic portal generate   → the plan is checked again; the key and the service address go into the portal
apimatic portal copilot sync → the CLI checks, the service checks and records the plan, then indexes
visitor opens the chat     → the service refuses (copilot_disabled) if the account's plan no longer has Ask AI
```

The service contract, which both branches implement: both routes take `Authorization: X-Auth-Key <auth key>` and `X-Copilot-Key: <pk_ key>`, and refusals come back as `{ code, message }`.
- `PUT /v1/portals`, with body `{ name, siteUrl, allowedOrigins }`, answers `201` created or `200` updated. Refusals: `401`, `403 not_entitled`, `409 key_taken`, `429 rate_limited` / `portal_limit_reached`, `400`.
- `DELETE /v1/portals` answers `204` revoked, `404` unknown (taken as already gone) or `403` someone else's key.

## Testing locally

```bash
export APIMATIC_COPILOT_URL=http://localhost:8787   # the local service, in PLATFORM_MODE=platform
export APIMATIC_BASE_URL=<dev platform>             # optional: when the service checks against the dev platform
apimatic auth login
apimatic portal copilot enable --dev
apimatic portal serve                               # try the chat
apimatic portal generate && apimatic portal copilot sync
apimatic portal copilot disable
```

To test the refusals, use an account whose plan doesn't include Ask AI: `enable`, `generate` and `sync` should each stop with the reason.

## Open questions

1. **The offline local flow no longer works with the CLI.** The CLI checks the subscription with the real platform before `generate` and `sync`, so the `dev_…` auth keys that the service's `pnpm admin-key` makes (with `PLATFORM_MODE=local`) can't be used with it. Testing locally now needs a real login whose plan includes Ask AI. Should the CLI skip its own check when `APIMATIC_COPILOT_URL` points at loopback, or is a real login acceptable for local testing?
2. **A platform outage on the service shows a generic error.** When the service can't reach the platform it answers `503 platform_unavailable` with a message, but `copilotFailureOf` turns any 5xx into the CLI's generic server error. Should the service's message be shown for 503 too?
3. **The production service address.** `https://ask.apimatic.io` is a placeholder until hosting is decided (Q7 in the plan).
4. **Release order.** This branch removes `apiUrl`, which PR #438 adds, so #438 must not be released without this branch (Q11 in the plan).
5. **Cancelled plans, before general availability.** The service only learns of a plan change on the account's next `enable` or `sync`, so a cancelled account's chat keeps working until then. Closing that gap needs the platform's Chargify webhook to notify the service on plan change, cancellation and expiry (Q4/Q10, option D). The platform team owns that change.
