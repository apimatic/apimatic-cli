# Plan: Copilot registration and subscription checks

Status (2026-10-22): decisions made; **CLI side built** on `feat/portal-copilot-subscription` (see "CLI implementation"). Service side not started. Builds on PR #438 (`feat/portal-ai-copilot`).

## Goal

1. The CLI generates a Copilot key.
2. The CLI registers the portal with the Copilot service under that key.
3. The key is written to `src/apimatic.json` (`portal.ai.copilot.key`), so the generated portal has Ask AI turned on.
4. Ask AI is allowed only for subscriptions that include it, the same way portal generation is allowed only for subscriptions that include on-prem generation.

## What exists today

### Platform (`apimatic-io`)
- `UserSubscription.IsApiCopilotAllowed()` is true when the plan's features include `SubscriptionFeature.AiChatBot`.
- `UserSubscription.ApiCopilotKeys` holds one GUID per subscription, kept in Chargify metadata and created when a trial starts (`SubscriptionManager.AddCopilotKeyMetadata`).
- `GET /api/account/profile` (`AccountApiController.GetProfile`) returns `tenantId`, `isApiCopilotAllowed`, `isOnPremGenerationAllowed` and `ApiCopilotKeys`.
- The old portal flow had `APIMATIC-BUILD.json` → `apiCopilotConfig.key`, which was checked against `ApiCopilotKeys` (`IsApiCopilotAllowedForDocsAsCode`). That check now runs only for older CLI versions, in `GeneratePortalAsyncCommandHandler`.
- The old chatbot backend (`ApimaticAiService`: `chatbot-settings`, `training-data`) is gated by the same `AiChatBot` feature.

### CLI (this repo)
- `PortalAuthorizationService` reads `/account/profile` and stops portal generation unless `isOnPremGenerationAllowed` is true. It fails closed when the platform can't be reached.
- `SubscriptionInfo` (`src/types/api/account.ts`) is missing `isApiCopilotAllowed`. `ApiCopilotKeys` is in the type, but nothing reads it.
- The `portal.ai.copilot` block (`key`, `apiUrl`, `suggestions`) is in `src/apimatic.json`. `portal copilot sync` does not check the subscription.

### Copilot service (`apimatic-chatbot-service`)
- `LocalPortalRegistry` stands in for the platform. It mints `pk_dev_…` / `pk_live_…` keys through the admin CLI, and `authorizeSync` matches the auth key's hash against its own `accounts` table.
- It never contacts the platform, so the subscription is never checked. Quotas (`QuotaGuard`) are usage limits, not entitlement.

## Questions and answers

### Q1. Where should the key go: `APIMATIC-BUILD.json` or `src/apimatic.json`?
**Answer:** `src/apimatic.json`. `APIMATIC-BUILD.json` in the brief was a mistake.

### Q2. Who generates the key: the service, the CLI, or reuse the subscription's `ApiCopilotKeys` GUID?
**Answer:** not the service. Choose between the CLI and the GUID.

**Decision (recommended): the CLI generates one key per portal.**

Why not reuse the subscription GUID:
- It's one key per subscription, but the service identifies a portal by its key. Two portals on the same account would share a key, so syncing one would replace the other's index.
- Rotating it would break every portal on the account, including any old-flow portals that use the same GUID.
- It's held in Chargify metadata and synced through a webhook, so a CLI-only feature would depend on billing data.
- The key is public: it ships in the portal's JavaScript. A per-portal key exposes one portal; the subscription GUID would expose an account-wide value.

How the CLI-generated key stays safe:
- It's generated with `crypto.randomBytes` in the service's format, `pk_live_<32 random chars>`, so it matches the service's `isCopilotKey` check.
- The key is not the credential. Registering it requires the user's APIMatic auth key, and the service checks it with the platform (profile → `tenantId` and `isApiCopilotAllowed`).
- The service refuses a key that is already registered (409). Registration is otherwise idempotent for the same tenant.
- The subscription GUID is not used by the new flow.

### Q3. Which subscription feature turns Ask AI on?
**Answer:** for now, the existing `AiChatBot` feature (`isApiCopilotAllowed` on the profile). A separate feature can come later if product wants one.

### Q4. How do we stop Ask AI when a subscription lapses?
The problem: the subscription can only be checked when the user's APIMatic auth key is in hand, which means on register and on sync. Visitors chatting on the portal use only the public key, so the service can't ask the platform about them. If a customer cancels and never syncs again, the chat keeps working.

| Option | How it works | Platform work | Gap |
|---|---|---|---|
| A. Check on register and sync | Store `entitled` and `entitlement_checked_at` on the account. Sessions are refused when `entitled = false` | None | Unbounded until the next sync |
| B. Entitlement expiry | As A, plus sessions are refused N days after the last check | None | N days, but the chat silently stops on stable docs that never re-sync |
| C. Internal entitlement endpoint | The service polls the platform by `tenantId` with a service credential (daily, cached) | Small endpoint + service credential | About a day |
| D. Plan-change webhook | The platform notifies the service when a plan changes | Most work (delivery, retries, service address) | Near zero |

**What the old copilot does:** option D, partly. The platform's Chargify webhook (`AccountController`, event `subscription_product_change`) calls the old AI service's `DeleteChatBotResourcesBatch` when an account moves to the free plan (`free-it4`). That deletes the chatbot's training data. It does not cover cancellation, expiry or payment failure (`subscription_state_change`, `renewal_failure`), which only re-sync the subscription.

**Decision (recommended): A now, then D following the old copilot's pattern.**
- A ships with no platform changes. The `entitled` column is where D (or C) writes later, so nothing is thrown away.
- D is the precedent: the webhook already tells the AI backend when a plan changes. Add a call to the new service there (for example `POST /internal/accounts/{tenantId}/entitlement`), and also send it for cancellation and expiry, which the old flow misses.
- C stays the fallback if the platform team prefers not to call another service from the webhook.
- B is rejected because the chat breaks silently for paying customers who simply didn't re-sync.
- The service's site refresh (`src/ingest/refresh.ts`) runs without an auth key, so it must also skip accounts with `entitled = false`.

### Q5. How is the Copilot service address chosen?
**Answer:** separate production and development addresses, so `apiUrl` isn't needed in `apimatic.json`.

**Decision (recommended):**
- The production address is built into the CLI and used by default.
- A development or local address is chosen with an environment variable (proposed name: `APIMATIC_COPILOT_URL`), alongside the existing `APIMATIC_BASE_URL` that switches the platform address.
- `apiUrl` is removed from `apimatic.json` and `apimatic.schema.json`. That leaves fewer settings, and it closes the risk of a third party's `apimatic.json` pointing the CLI at their own server. The `receivesSavedLogin` allow-list remains as a check on the environment variable.
- The address is written into the portal at `generate` time. A portal built against the dev service therefore talks to the dev service, and a key registered on dev doesn't exist on prod.
- Point the dev Copilot service at the dev platform, and the prod service at the prod platform.

## Proposed workflow

1. `apimatic auth login`.
2. `apimatic portal copilot enable` (new), run in the project:
   1. Reads `/account/profile`. If `isApiCopilotAllowed` is false, it stops: "Your subscription does not include Ask AI", with a pricing link.
   2. If `apimatic.json` already has a key, it says Ask AI is already on and offers to rotate the key.
   3. Asks for the portal's allowed origins and site URL.
   4. Generates `pk_live_…`.
   5. Calls `POST /v1/portals` with the auth key, sending the key, origins and site URL. The service checks the auth key with the platform and registers the portal under the `tenantId`.
   6. Writes `portal.ai.copilot.key` into `src/apimatic.json`.
3. `apimatic portal generate`: the chat and bundle are included. If `apimatic.json` has the `copilot` block and the plan doesn't include Ask AI, generate fails and says why (see Q9).
4. Deploy, then `apimatic portal copilot sync`: the CLI pre-checks, and the service re-checks and refreshes `entitled`.
5. Visitors chat: the service checks that the portal is enabled, the account is entitled, and quotas remain.

## Changes

### CLI
- `SubscriptionInfo`: add `isApiCopilotAllowed`.
- `CopilotAuthorizationService`, modelled on `PortalAuthorizationService` (unauthenticated / unverifiable / not entitled; fails closed).
- `portal copilot enable`: command, action and prompts, following `.ai/skills`.
- Key generation as a value object (`CopilotKey`).
- A registration call in the copilot service client.
- `copilot sync`: entitlement pre-check. `generate` (and `serve` / `quickstart`, which share `prepare-project`): fail with the reason when the `copilot` block is present and the plan doesn't include Ask AI.
- Remove `apiUrl` from `CopilotConfig` and the schema; resolve the address from the build-in default or the env variable.
- Messages for `not_entitled`, `key_taken`, `429 rate_limited` and `service_budget_exceeded`.

### Copilot service
- `PlatformAccountResolver`: calls the profile with the auth key → `{ tenantId, isApiCopilotAllowed }`, with a short cache keyed by the key's hash.
- `accounts.id` becomes `tenantId`, so a team shares its portals. Replace the `auth_key_hash` matching.
- `POST /v1/portals`: register or rotate, rate-limited and entitlement-checked; refuses a taken key.
- `authorizeSync`: goes through the resolver and refreshes `entitled`.
- `/v1/sessions` and site refresh: refuse when the account is not entitled.
- Migration `004`; update `API.md`.

### Platform
- None for option A.
- For option D: in the Chargify webhook, notify the new service on plan changes, cancellation and expiry, next to the existing `DeleteChatBotResourcesBatch` call.
- For option C (fallback): `GET /internal/copilot/entitlement/{tenantId}` with a service credential.

## Production readiness (added 2026-10-22)

The bar: everything production ready, and everything testable on a local machine.

### Additions to the plan
1. **Managing a portal after `enable`.** Re-running `portal copilot enable` updates the origins and site URL of the existing key instead of creating a new portal. `--rotate` issues a new key and revokes the old one. A new `portal copilot disable` revokes the key and removes `portal.ai.copilot` from `apimatic.json`. Without these, a leaked key or a domain change needs an admin.
2. **Registration limits.** `PUT /v1/portals` is rate-limited per tenant and capped at a number of portals per tenant (configurable, default 20), so a valid login can't fill the database with keys.
3. **A key already registered.** The same key from the same tenant is treated as an update (idempotent). The same key from another tenant gets 409. The CLI never retries with the same key.
4. **The user's auth key on the service.** It's used only to call the platform's profile endpoint. It's never logged or stored; the cache keeps a SHA-256 of it, for a few minutes.
5. **Platform address on the service.** A setting `APIMATIC_API_URL` (default `https://api.apimatic.io`), so the dev service checks against the dev platform and a local service can use either.
6. **Platform outage.** Register and sync fail closed with a clear message (as portal generation does). Chat never calls the platform at visitor time, so a platform outage does not take the chat down.
7. **Building with a dev key.** `portal generate` warns when `portal.ai.copilot.key` is a `pk_dev_` key: it works only on `localhost` and is capped at 200 questions a day.
8. **Telemetry.** `PortalCopilotEnableFailedEvent`, alongside the existing `PortalCopilotSyncFailedEvent`.
9. **Docs.** CLI README (regenerated for the new commands), the service's `API.md` (new endpoint and error codes), and `COPILOT-LOCAL-TESTING.md` (the new local flow).
10. ~~`apiUrl` removal goes into PR #438.~~ Superseded by Q11: it goes into the new branch.

### Local testing
- **Unit tests:** the CLI mocks the profile and the service with `nock`. The service gets a fake `PlatformAccountResolver`, so its tests never call the platform.
- **Local end to end, real login:** local service with `APIMATIC_API_URL` set to the dev platform, and the CLI with `APIMATIC_COPILOT_URL=http://localhost:8787` and `APIMATIC_BASE_URL` set to the dev platform. Run `enable --dev`, `generate`, `serve` and `sync`.
- **Local end to end, offline:** a `PLATFORM_MODE=local` setting on the service that keeps today's local registry (accounts created with `pnpm admin-key`), so the service and the CLI's e2e suite run without any platform. Refused in production (`NODE_ENV=production`).
- **Subscription cases:** a dev-platform account with `AiChatBot` and one without, to check the refusals in `enable`, `generate` and `sync`.

### Not in our hands (needed before general availability)
- **Platform:** the webhook call for plan changes, cancellation and expiry (Q4, option D). Until it ships, a cancelled account's chat keeps working until its next sync. This is the one gap left in "production ready".
- **Hosting:** where the service runs and its prod and dev addresses (Q7; the service's plan, section 8).

### Out of scope for now
- Versioned portals (`generateVersionedPortal`): one key per project; how versions share an index is a separate decision.
- Separate pricing or a separate subscription feature for the new copilot (Q3).

## Branch

**Decision (recommended):** a new branch, `feat/portal-copilot-subscription`, cut from `feat/portal-ai-copilot` (stacked).
- PR #438 is open with changes requested. Adding this work would make a 44-commit review larger and slower.
- Open the new PR against `feat/portal-ai-copilot`, and retarget it to `dev` once #438 merges. Rebase it whenever #438 gets review fixes.
- Removing `apiUrl` and adding `APIMATIC_COPILOT_URL` are on this branch too, not in #438 (Q11). #438 must therefore not be released without this branch, or a released `apiUrl` setting would be taken away.
- The service work goes on its own branch in `apimatic-chatbot-service` (proposed: `feat/platform-subscription`).

## Follow-up questions and answers

### Q6. Which key type does the CLI generate: `pk_live_` or `pk_dev_`?
**Answer:** my call; the requirement is that everything can be tested locally and on the dev and prod deployments.

Note that the key type is not the service environment. In the service, a key's type means:

| | `pk_dev_` | `pk_live_` |
|---|---|---|
| Browser origins | Listed origins plus `localhost` / `127.0.0.1` | Listed origins only |
| Site refresh | `http://localhost` allowed | `https` only, private addresses blocked |
| Questions per day | 200 | No daily cap (monthly quota only) |

Which service the key lives on (local, dev or prod) is decided by the service address (Q5/Q8). A key registered on the dev service does not exist on prod.

**Decision:**
- `portal copilot enable` generates `pk_live_` by default, for portals that are deployed.
- `portal copilot enable --dev` generates `pk_dev_`, for previewing with `portal serve` on `localhost`. A live key's chat hides itself on `localhost` (`origin_not_allowed`).
- Testing matrix: local service + `--dev` key; dev deployment + `pk_live_` key on the dev service; prod deployment + `pk_live_` key on the prod service.
- Later, if customers want to preview a live portal locally: register a dev and a live key for the same portal, and have `portal serve` use the dev one.

### Q7. What are the production and development service addresses?
**Answer:** not decided yet. The CLI keeps them as two constants, filled in once the service is deployed.

### Q8. What is `APIMATIC_COPILOT_URL` for?
It's an environment variable that tells the CLI which Copilot service to use, when it shouldn't use the built-in production address. The CLI uses the address in three places: `copilot enable` registers the key there, `copilot sync` uploads there, and `portal generate` writes it into the portal so the visitor's browser talks to it.

The CLI already does the same for the platform. `APIMATIC_BASE_URL` (`src/infrastructure/env-info.ts`) points the CLI at a dev or staging platform instead of `api.apimatic.io`.

Uses:
- Local: `APIMATIC_COPILOT_URL=http://localhost:8787`.
- Dev deployment: `APIMATIC_COPILOT_URL=<dev service address>`, together with `APIMATIC_BASE_URL` pointing at the dev platform.
- Prod: not set.

Without it, the address would have to live in `apimatic.json` (today's `apiUrl`), or we'd need a separate CLI build per environment.

**Decision:** a separate variable, not a fourth slot in `APIMATIC_BASE_URL`. That list is positional (`base;auth;publishing`) and is already hard to read, and a local service is often tested against the dev platform. The `receivesSavedLogin` allow-list still applies to the address it gives.

### Q9. Should `portal generate` warn or fail when the plan doesn't include Ask AI?
**Answer:** fail, and tell the user why.

**Decision:**
- The check sits in `prepare-project`, next to the existing on-prem check, and uses the same profile response, so there is no extra request.
- It applies only when `apimatic.json` has the `copilot` block.
- Message: the plan doesn't include Ask AI, a pricing link, and the option to remove `portal.ai.copilot` from `src/apimatic.json` to build without it.

### Q10. Do we need the platform side of Q4 (option C or D)?
**Answer (from the code):** the old copilot did have it, partly. See "What the old copilot does" under Q4. It deletes the chatbot's data when an account moves to the free plan, but not on cancellation or expiry.

**Decision:** not for the first release (option A). Before general availability, follow the old pattern (option D) and add the missing cancellation and expiry cases. The platform team owns that change.

### Q11. Where do the `apiUrl` removal and `APIMATIC_COPILOT_URL` go, and is the name final?
**Answer:** on the new branch, not in #438. The name `APIMATIC_COPILOT_URL` stays.

## CLI implementation (built 2026-10-22, branch `feat/portal-copilot-subscription`)

### What changed
| Area | Change | Files |
|---|---|---|
| Subscription | `SubscriptionInfo` reads `isApiCopilotAllowed`. `AccountEntitlements` holds what the plan allows. `PortalAuthorizationService.authorize` now returns the entitlements; new `authorizeAskAi`. A failure names the missing feature (`notEntitled` + `feature`). | `src/types/api/account.ts`, `src/types/api/account-entitlements.ts`, `src/infrastructure/services/portal-authorization-service.ts`, `src/prompts/portal/authorization.ts` |
| Generate / serve | Fail when `portal.ai.copilot` is set and the plan has no Ask AI, saying how to build without it (Q9). | `src/actions/portal/prepare-project.ts`, `src/prompts/portal/prepare-project.ts` |
| Generate | Warns when the portal is built with a `pk_dev_` key. | `src/actions/portal/generate.ts`, `src/prompts/portal/generate.ts` |
| Service address | `apiUrl` removed from `portal.ai.copilot` (parser and schema; it is now an unknown setting). The address is `https://ask.apimatic.io` unless `APIMATIC_COPILOT_URL` names another. Any `https://` address, or `http(s)://` on loopback, is accepted: the address now comes from the user's environment, not the project's file, so the old "apimatic.io only" rule (which guarded against a third party's `apimatic.json`) is no longer needed, and it would have refused a dev deployment on its host's own domain. | `src/types/portal/config/service-address.ts`, `src/types/portal/config/copilot-config.ts`, `src/infrastructure/env-info.ts`, `apimatic.schema.json` |
| `portal copilot enable` | New command (flags `--dev`, `--rotate`, `--origin` (repeatable), `-i`, `-k`). | `src/commands|actions|prompts/portal/copilot/enable.ts`, `src/types/portal/copilot/copilot-key.ts`, `src/types/portal/copilot/copilot-registration.ts`, `src/types/portal-source-context.ts` (`writeCopilotKey`) |
| `portal copilot disable` | New command: revokes the key, removes `portal.ai.copilot` (and an emptied `ai` block). No subscription check, so a lapsed account can still revoke. | `src/commands|actions|prompts/portal/copilot/disable.ts` |
| `portal copilot sync` | Checks the Ask AI subscription before uploading; uses the shared `resolveAuthKey`. | `src/actions/portal/copilot/sync.ts`, `src/prompts/portal/copilot/sync.ts`, `src/client-utils/auth-manager.ts` |
| Service client | `CopilotPortalService` (`register`, `revoke`). Error mapping shared with ingest in `copilot-responses.ts`, now also passing on the service's message for 409 and 429. | `src/infrastructure/services/copilot-portal-service.ts`, `src/infrastructure/services/copilot-responses.ts` |
| Telemetry | `PortalCopilotEnableFailedEvent`, `PortalCopilotDisableFailedEvent`. | `src/types/events/` |

### `enable` flow
1. Read the `portal` block (fails on a missing or invalid `apimatic.json`).
2. Resolve the service address (fails on an unusable `APIMATIC_COPILOT_URL`).
3. Build the registration: name = `site.name`, `siteUrl` = `site.url`, allowed origins = origin of `site.url` + each `--origin`. A live key with no origin is refused.
4. Choose the key: a new `pk_live_`/`pk_dev_` key when there is none or with `--rotate`; otherwise the existing one (re-registered, so changed origins reach the service). An existing key of the other kind, or one the service would not accept, is refused with a pointer to `--rotate`.
5. Resolve the APIMatic login (`--auth-key`, else the saved one).
6. Check the subscription (`isApiCopilotAllowed`).
7. `PUT /v1/portals`.
8. Write the key into `apimatic.json` (only if it changed). On a write failure the key is printed so it can be set by hand.
9. With `--rotate`, revoke the old key only after the new one is saved; a failed revoke is a warning.

### Contract the service must implement (for the service branch)
Both routes take `Authorization: X-Auth-Key <APIMatic auth key>` and `X-Copilot-Key: <pk_ key>` (in a header so it stays out of access logs), and answer refusals as `{ code, message }`. The CLI shows `message`.

`PUT /v1/portals`: register or update the portal under the key.
- Body: `{ "name": string, "siteUrl": string | null, "allowedOrigins": string[] }`.
- `201` created; `200` updated (same key, same tenant).
- `401` login not valid; `403` `not_entitled` (plan has no `AiChatBot`); `409` `key_taken` (the key belongs to another tenant); `429` `rate_limited` / `portal_limit_reached`; `400` invalid body or key format.

`DELETE /v1/portals`: revoke the key.
- `204` revoked; `404` unknown key (the CLI treats it as already gone); `403` key belongs to another tenant; `401` login not valid.

### Testing locally
- Unit tests: `pnpm exec tsx node_modules/mocha/bin/_mocha "test/**/copilot/**/*.test.ts" --timeout 99999`. The platform and the service are mocked (sinon stubs and nock).
- Against a local service (once the service branch exists):
  ```bash
  export APIMATIC_COPILOT_URL=http://localhost:8787
  export APIMATIC_BASE_URL=<dev platform>   # optional: log in against the dev platform
  apimatic auth login
  apimatic portal copilot enable --dev       # key works on localhost
  apimatic portal serve                      # try the chat
  apimatic portal generate && apimatic portal copilot sync
  apimatic portal copilot disable
  ```
- Dev and prod deployments: the same, with `APIMATIC_COPILOT_URL` set to the dev service (or unset for prod), and without `--dev`.

### Still to confirm before release
- `https://ask.apimatic.io` is a placeholder for the production address (Q7).
- #438 and this branch must ship together (Q11).

## Handoff (2026-10-23)
- Branch `feat/portal-copilot-subscription` (from `feat/portal-ai-copilot`, PR #438). All CLI work above is **uncommitted** in the working tree; nothing pushed.
- Verified: `pnpm build` passes; full `pnpm test` 2133 passing / 83 pending (e2e skipped); `eslint .` clean. README regenerated (convert it to LF first: oclif's readme duplicates the command list on CRLF files).
- e2e portal build tests pass (2026-10-23): `APIMATIC_E2E=1`, 77 passing. Not done: a manual run against a real service with a real login.
- Decided (2026-10-23): keep the relaxed service address rule (any `https://` or loopback, since the address now comes from `APIMATIC_COPILOT_URL`).
- Decided (2026-10-23): don't commit the CLI work yet; it stays uncommitted until the user says so.

### Service side (built 2026-10-23, uncommitted)
Branch `feat/platform-subscription` in `D:\apimatic\cli-repo\apimatic-copilot-service\apimatic-chatbot-service`, cut from `origin/bugfix/fixes-before-production` at the user's request (2026-10-23; it was first cut from `main`). Nothing committed. The migration is `006_account_entitlement.sql`, because that branch already has `004` and `005`. The original work is still in `git stash` ("platform-subscription") as a backup.
- `src/accounts/`: `AccountResolver`. `PlatformAccountResolver` calls `GET <APIMATIC_API_URL>/account/profile` with `X-Auth-Key`, reads `tenantId` and `isApiCopilotAllowed`, and caches for 5 minutes by the key's SHA-256 (outages aren't cached; it fails closed). `LocalAccountResolver` reads `accounts.auth_key_hash`.
- Config: `PLATFORM_MODE` (`platform`|`local`; unset means `platform` in production and `local` otherwise; `local` is refused in production), `APIMATIC_API_URL`, `RATE_REGISTRATIONS_PER_HOUR_PER_ACCOUNT` (20), `MAX_PORTALS_PER_ACCOUNT` (20).
- Migration `006`: `accounts.entitled`, `accounts.entitlement_checked_at`. Accounts are tenants and are created on their first register or sync.
- `src/http/account-auth.ts` `verifyAccount`: 401 `unauthenticated`, 503 `platform_unavailable`, 403 `not_entitled`. It records the plan on every check.
- `src/http/portal-routes.ts`: `PUT /v1/portals` (201/200, 409 `key_taken` also for a revoked key, 429 `rate_limited`/`portal_limit_reached`, 400 `invalid_key`/`invalid_request`) and `DELETE /v1/portals` (204/404/403, no plan check). Registry: `accountPortal` (replaces `authorizeSync`), `recordEntitlement`, `registerPortal` (advisory locks: account, then key), `revokePortalKey`; admin `setEntitled` and `pnpm admin-key entitlement --account <id> on|off`.
- Sessions and chat answer `copilot_disabled` when `entitled = false`; refresh skips such portals.
- Docs: API.md, DATABASE.md, README, CLAUDE.md, COPILOT-LOCAL-TESTING.md (rewritten around `enable`), `.env.example`. `apiUrl` was dropped from the admin and bootstrap printouts.
- Verified on the new base: `pnpm test` gives 231 passing and 0 failing (typecheck and lint included); the build passes, and Prettier is clean on every changed file. The base branch's `.gitattributes` (`eol=lf`) fixes the CRLF fixture failures that `main` has on Windows.

### Docs written for the user (2026-10-23, uncommitted)
- `apimatic-cli/.ai/plans/copilot-subscription-changes.md`: the task, the CLI changes, how the CLI and the service fit together, and open questions.
- `apimatic-chatbot-service/.ai/plans/platform-subscription-changes.md`: the same for the service.
- `apimatic-cli/COPILOT-LOCAL-TESTING.md` (repo root): local testing steps for both repos (service setup, CLI setup, main flow, refusals, simulating a lapsed plan, `psql` queries, automated tests, troubleshooting). The expected messages in it were checked against the CLI prompts.

### Manual end-to-end run (2026-10-23): works locally
- The user tested against the **dev platform**.
  - The CLI terminal has `APIMATIC_BASE_URL=https://app.dev.apimatic.io/api;https://auth.dev.apimatic.io;https://api.package-publishing.dev.apimatic.io/api` and `APIMATIC_COPILOT_URL=http://localhost:8787`.
  - The service's `.env` has `PLATFORM_MODE=platform` and `APIMATIC_API_URL=https://app.dev.apimatic.io/api`. The latter was added after a 401 from the service: the CLI was on dev while the service checked production.
  - The dev platform has its own accounts. Both `https://app.dev.apimatic.io/api/account/profile` and `https://api.apimatic.io/account/profile` answer 401 for a missing or wrong key, which confirms what `PlatformAccountResolver` assumes.
- `enable --dev`, `generate`, `serve` and chat all worked locally.
- **Deployed portal:** the user deployed the "Parcelly Shipping API" portal to `https://parcelly-shipping-api.muhammad-waseem.workers.dev`. The chat got `403 origin_not_allowed`.
  - Cause: its key is `pk_dev_` with `allowed_origins = {}`. The project has no `portal.site.url`, and `enable` ran without `--origin`. A dev key with no origins only answers localhost.
  - Fixes told to the user: `enable --dev --origin <site>` (same key, no rebuild), or set `portal.site.url` and switch to a live key with `enable --rotate` (then regenerate, redeploy and sync).
  - Also told: that portal was built with `APIMATIC_COPILOT_URL=http://localhost:8787`, so only the user's own browser reaches the service. Others need a deployed service.

### Open points for the user
- **Offered, not yet answered:**
  - (a) `enable --dev` with no origins should warn "works only on localhost; pass `--origin <site>` for a deployed portal".
  - (b) `portal generate` should warn when the key is `pk_dev_` and `site.url` is not localhost.
  - (c) The service's 401 message should name the platform host it asked, e.g. "APIMatic (app.dev.apimatic.io) doesn't recognise this auth key", so a mismatch between the CLI's and the service's platforms is obvious.
  - (d) Reword open question 1 in `copilot-subscription-changes.md`: local testing works with a real login, and only the fake `dev_…` key shortcut for `sync` is gone. The user hasn't decided whether to drop the question.
- **Local testing needs a real login.** The CLI's subscription pre-check means the `dev_…` keys from `pnpm admin-key` (`PLATFORM_MODE=local`) only work with the service's own `pnpm sync`. Either accept that, or skip the CLI's pre-check when `APIMATIC_COPILOT_URL` is on loopback.
- **Generic error on 503.** The CLI shows its generic server error for a 503 `platform_unavailable`. `copilotFailureOf` could pass on the service's message for 503 as it does for 4xx.
- **Still open from earlier:**
  - The production service address: `https://ask.apimatic.io` is a placeholder (Q7).
  - #438 must ship with this branch (Q11).
  - The platform webhook for cancelled plans is needed before general availability (Q4, Q10).
  - Hosting the service publicly.
- **Next steps:**
  - Commit both branches when the user asks, and open a PR for each: the CLI against `feat/portal-ai-copilot`, the service against `bugfix/fixes-before-production`.
  - The service stash "platform-subscription" can be dropped once the user is happy with the branch.
- Platform reference: `apimatic/apimatic-io` (branch `development`) — `APIMatic.DAL/Subscription/UserSubscription.cs` (`IsApiCopilotAllowed` = `AiChatBot` feature), `APIMatic.Web/APIControllers/AccountApiController.cs` (`/api/account/profile` returns `isApiCopilotAllowed`), Chargify webhook in `APIMatic.Web/Controllers/AccountController.cs`.
