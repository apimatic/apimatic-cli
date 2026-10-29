# Ask AI: portal keys and subscription checks

Status (2026-10-29): built and tested end to end, in review.
- CLI: `feat/portal-copilot-subscription`, PR #459, against `feat/portal-ai-copilot` (PR #438).
- Service: `apimatic-chatbot-service` `feat/platform-subscription`, PR #8, against `main`.
- Tested end to end against the dev platform, its Chargify site (through a tunnel to a local service) and OpenAI: enable, generate, chat, a trial moved to Free turning Ask AI off with the upgrade message, and back on after an upgrade and a sync.

## What the CLI does

| Command | What it does |
|---|---|
| `portal copilot enable` | Makes a key for the portal (`pk_live_`, or `pk_dev_` with `--dev`), registers it with the Ask AI service (`PUT /v1/portals`) and writes it to `portal.ai.copilot.key`. `--rotate` makes a new key and revokes the old one only after the new one is saved; `--origin` adds sites allowed to use it. Run again, it re-registers the same key, so changed origins reach the service. |
| `portal copilot disable` | Revokes the key (`DELETE /v1/portals`) and removes `portal.ai.copilot`. No plan check, so a lapsed account can still revoke. |
| `portal generate`, `serve` | Refuse a portal with `portal.ai.copilot` when the plan lacks Ask AI (`isApiCopilotAllowed`), saying how to build without it. `generate` warns about a `pk_dev_` key, and about a service other than APIMatic's. |
| `portal copilot sync` | Checks the plan, then uploads the pages. |

The service address is `https://ask.apimatic.io` unless `APIMATIC_COPILOT_URL` names another: any `https://` address, or one on loopback. `apiUrl` is gone from `apimatic.json`. A bad variable is reported as itself, only for a portal with Ask AI.

The portal's panel shows nothing usable until the service answers, then the chat, or the lapsed plan's message with an Upgrade link (`copilot_disabled` with `reason` and `upgradeUrl`); the kill switch, an unknown key or another website hide Ask AI.

## How the two sides fit

```
portal copilot enable  → CLI checks the plan, PUT /v1/portals; the service asks the platform again with the same
                         auth key, records the plan, registers the key under the tenant
portal generate        → plan checked again; key and service address built into the portal
portal copilot sync    → CLI checks; the service checks, records the plan, indexes
visitor chats          → refused (copilot_disabled) once the account's plan lacks Ask AI
trial moves to Free    → Chargify's webhook (POST /webhooks/chargify on the service) turns the account off and
                         deletes its Ask AI data; the next sync after an upgrade turns it back on
```

Both portal routes take `Authorization: X-Auth-Key <auth key>` and `X-Copilot-Key: <pk_ key>`; refusals are `{ code, message }`, and the CLI shows `message`. The service's `API.md` has the full contract.

## Decisions

- **The key goes in `src/apimatic.json`**, not `APIMATIC-BUILD.json`.
- **The CLI makes one key per portal**, not the subscription's `ApiCopilotKeys` GUID: portals on one account would share an index, and rotating it would break them all. The key is public; registering it needs the APIMatic login, which the service checks with the platform.
- **The plan flag is the existing `AiChatBot` feature** (`isApiCopilotAllowed`).
- **The address comes from the environment, not the project's file**, so a third party's `apimatic.json` can't send the saved login elsewhere. `APIMATIC_COPILOT_URL` is separate from `APIMATIC_BASE_URL`, since a local service is often tested against the dev platform.
- **`generate` fails, not warns**, on a plan without Ask AI, in `prepare-project` with the same profile request as the on-prem check.
- **A lapsed plan is learnt on the next register or sync, or when Chargify reports a move to Free** (`subscription_product_change` to `free-it4`, as the old copilot's deletion did). Chargify calls the service directly, so the platform needs no change. Not cut off in real time: agreed with the team.
- **Keys:** `pk_live_` by default, for a deployed portal; `pk_dev_` with `--dev`, for `localhost` and capped at 200 questions a day.
- **This branch removes `apiUrl`, which #438 adds,** so #438 is released only with it.

## Testing locally

The service repo's `COPILOT-LOCAL-TESTING.md` has the flow. In short: the service with `PLATFORM_MODE=platform`, the CLI with `APIMATIC_COPILOT_URL=http://localhost:8787` (and `APIMATIC_BASE_URL` for the dev platform), then `auth login`, `enable --dev`, `generate`, `serve`, `sync`, `disable`. The CLI checks the plan with the platform itself, so it needs a real login: the service's `dev_…` keys work only with its own `pnpm sync`.

## Still open

- **The production address:** `https://ask.apimatic.io` is a placeholder until the service is hosted.
- **Fumadocs 16.17.9** fixes the section-link bug upstream (fuma-nama/fumadocs#3758). The repo installs only versions at least 7 days old, so from 2026-11-04: upgrade `fumadocs-core` and `fumadocs-ui`, then delete `portal-template/src/lib/router-link.tsx`, `link-target.ts`, its test, and the `components={{ Link: RouterLink }}` in `__root.tsx`.
- **A platform outage shows a generic error:** the service answers `503 platform_unavailable` with a message, but `copilotFailureOf` turns any 5xx into the CLI's generic server error.
- **Other ways to lose Ask AI** (cancellation, a paid plan without it) are caught on the next CLI run; the Chargify route acts only on a move to Free.
- **Versioned portals** (`generateVersionedPortal`): one key per project; how versions share an index is still to decide.
