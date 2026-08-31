# Service Conventions

Services live at `src/infrastructure/services/` and are the only layer that makes external API calls. Every public method returns `Promise<Result<T, ServiceError>>` using neverthrow — services never throw to their callers. There are three variants: SDK controller (wraps `@apimatic/sdk`), axios with auth, and stateless axios.

## Conventions

### DO

- **DO** use named export: `export class {PascalName}Service`.
- **DO** return `Promise<Result<T, ServiceError>>` from all public methods — use `ok()` and `err()` from neverthrow.
- **DO** catch `ProblemDetailsError` first (for 400/403 with structured error messages), then fall back to `handleServiceError(error)`.
- **DO** close file streams in `finally` blocks when using `FileWrapper` or `getStream()`.
- **DO** resolve auth as: `getAuthInfo(configDir.toString())` → `createAuthorizationHeader()` → `apiClientFactory.createApiClient()`.
- **DO** use `createAuthorizationHeader` as a private arrow function.
- **DO** use `envInfo.getBaseUrl()` as a fallback base URL — allows overriding in test environments.
- **DO** use `as const` on base URL string literals.
- **DO** initialize `FileService` inline as a `private readonly` field.
- **DO** format auth header as `X-Auth-Key ${key ?? ""}` (space, not colon).
- **DO** pre-check auth before any API call in axios-auth services: `if (authInfo === null && !authKey) return err(ServiceError.UnAuthorized)`.
- **DO** use `authKey || authInfo?.authKey` for token resolution — flag override takes precedence.
- **DO** define response types as `interface` or `type` (in the file or in `src/types/`).

### DON'T

- **DON'T** throw — always return `err(...)` wrapped in `ServiceError`.
- **DON'T** use `console.log` — services are silent; errors communicated via `Result`.
- **DON'T** use raw string paths — use `DirectoryPath`, `FilePath`, `UrlPath`, `FileName`.
- **DON'T** use `axios.create()` as a class field — create a fresh instance per call in `axiosInstance()` method.
- **DON'T** use `ApiError` as the primary catch branch — `ProblemDetailsError` should be caught first.
- **DON'T** skip the `finally` block when a `FileWrapper` or stream is opened.
- **DON'T** hardcode base URLs without falling back to `envInfo.getBaseUrl()` (except for third-party endpoints).

### SDK controller variant rules

- Instantiate controller per method call: `new {ControllerName}(client)` inside the method.
- `apiClientFactory.createApiClient(authHeader, shell)` provides the configured client.
- For async/polling SDK methods, don't hand-roll the poll loop — reuse `pollUntilCompleted()` from `src/infrastructure/generation-status-poller.ts`, passing `{ pollIntervalMs, fetchStatus, timeout }`. Every pollable flow must pass a `timeout: { budgetMs, label }`; without one a stuck generation sits on the spinner forever. The budget alone is not a limit — it is only read between polls, so the `axiosInstance` behind `fetchStatus` also needs a `timeout`, or a poll that connects and never answers outlives the budget and hangs the CLI. The `label` opens the timeout message, so name the flow as the user knows it (`"Portal generation"`, `"SDK generation"`). Take the budget from a `generationTimeoutMs` constructor parameter so tests can shrink it. Only supply a `formatValidationError` when the endpoint needs custom validation wording (see `formatSdkValidationError`).
- Give each pollable endpoint its own private `get{Flow}GenerationStatus()` on the service that owns the flow, with the `{basePath}/{requestId}/status` path written out in it. Generation flows are independent and free to diverge, so the status fetch is deliberately not shared and takes no endpoint parameter, even where two flows currently read identically — resist factoring the bodies back together. A finished generation arrives as a `302` to the download location, not a `Completed` status body, so each method needs `maxRedirects: 0` and its own `302` mapping.
- An SDK-controller service that polls therefore also carries the axios-auth plumbing (`axiosInstance`, `apiBaseUrl`): the status endpoints are read over raw axios because a generated controller cannot surface the `302`. `portal-service.ts` is both variants at once for that reason.

### Axios-auth variant rules

- `axiosInstance(shell, token)` is a private method (not arrow function) that returns a fresh axios instance.
- Use `envInfo.getAuthBaseUrl()` for auth-specific endpoints (separate from the main API base URL).
- Add `validateStatus: () => true` to handle non-2xx responses without throwing.

### Stateless variant rules

- No `axiosInstance` factory — use `axios.get()`/`axios.post()` directly.
- No auth imports or resolution.
- URL is passed as a parameter or hardcoded per method.

---

## Review Checklist

- [ ] All imports use `.js` extension (e.g., `../../client-utils/auth-manager.js`)
- [ ] File placed at `src/infrastructure/services/{name}-service.ts`
- [ ] Named export (not default): `export class {PascalName}Service`
- [ ] All public methods return `Promise<Result<T, ServiceError>>` using neverthrow
- [ ] Uses `ok()` and `err()` from neverthrow — never throws
- [ ] Catch blocks use `handleServiceError(error)` as fallback
- [ ] Auth uses `getAuthInfo(configDir.toString())` — note `.toString()` on DirectoryPath
- [ ] Auth header format: `X-Auth-Key ${key ?? ""}` (space, not colon)
- [ ] `private readonly` for all field declarations
- [ ] `as const` on base URL string literals
- [ ] No `console.log` — services are silent
- [ ] No raw string paths — use `DirectoryPath`, `FilePath`, `UrlPath`, `FileName`
- [ ] Response types defined as `interface` or `type`
- [ ] File streams closed in `finally` block when using `FileWrapper`

## Reference Files

| Pattern | File |
|---|---|
| SDK controller + async polling | `src/infrastructure/services/portal-service.ts` |
| Per-endpoint generation status fetch | `src/infrastructure/services/portal-service.ts`, `src/infrastructure/services/plugin-service.ts` |
| Shared generation poll loop | `src/infrastructure/generation-status-poller.ts` |
| SDK controller + FormData | `src/infrastructure/services/validation-service.ts` |
| Raw axios with auth + axiosInstance | `src/infrastructure/services/api-service.ts` |
| Raw axios with different base URL | `src/infrastructure/services/auth-service.ts` |
| Stateless axios (no auth) | `src/infrastructure/services/file-download-service.ts` |
| ServiceError class + handleServiceError | `src/infrastructure/service-error.ts` |
| SDK client factory (singleton) | `src/infrastructure/services/api-client-factory.ts` |
| envInfo (base URLs, user agent) | `src/infrastructure/env-info.ts` |

---

## Scaffolding

Use when creating a new infrastructure service. Choose the variant that matches the API access pattern.

### What to determine

1. **Service name** — lowercase hyphenated (e.g., `copilot`, `billing`). File will be `{name}-service.ts`
2. **Class name** — PascalCase (e.g., `CopilotService`, `BillingService`)
3. **Variant** — one of:
   - `sdk-controller` — uses `@apimatic/sdk` controller classes via `apiClientFactory`
   - `axios-auth` — raw axios with auth (base URL, `axiosInstance` factory, auth pre-check)
   - `axios-stateless` — raw axios without auth (direct calls)
4. **Needs auth** — whether methods resolve auth via `getAuthInfo` + `authKey` parameter
5. **Initial method** — name, parameters, and return type for the first method to scaffold
6. **Response type** — type/interface for the success value

### SDK Controller Service Template

**Use when:** the service wraps an `@apimatic/sdk` controller (e.g., generation, transformation, validation).

**Based on:** `src/infrastructure/services/portal-service.ts`, `src/infrastructure/services/validation-service.ts`

```typescript
import {
  {ControllerName},
  ContentType,
  FileWrapper,
  ProblemDetailsError,
  ApiError,
} from "@apimatic/sdk";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { FileService } from "../file-service.js";
import { apiClientFactory } from "./api-client-factory.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { err, ok, Result } from "neverthrow";
import { handleServiceError, ServiceError } from "../service-error.js";

export class {PascalName}Service {
  private readonly CONTENT_TYPE = ContentType.EnumMultipartformdata;
  private readonly fileService = new FileService();

  public async {methodName}(
    filePath: FilePath,
    configDir: DirectoryPath,
    commandMetadata: CommandMetadata,
    authKey: string | null
  ): Promise<Result<{ResponseType}, ServiceError>> {
    const fileStream = await this.fileService.getStream(filePath);
    const file = new FileWrapper(fileStream);

    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    const authorizationHeader = this.createAuthorizationHeader(authInfo, authKey);
    const client = apiClientFactory.createApiClient(authorizationHeader, commandMetadata.shell);
    const controller = new {ControllerName}(client);

    try {
      const response = await controller.{sdkMethod}(
        this.CONTENT_TYPE,
        file
      );
      return ok(response.result);
    } catch (error) {
      if (error instanceof ProblemDetailsError) {
        const message = Object.values(error.result!.errors as Record<string, string[]>)[0]?.[0] ?? null;
        const errorMessage = error.result!.title + "\n- " + message;
        if (error.statusCode === 400) {
          return err(ServiceError.badRequest(errorMessage));
        }
        if (error.statusCode === 403) {
          return err(ServiceError.forbidden(errorMessage));
        }
      }
      return err(handleServiceError(error));
    } finally {
      fileStream.close();
    }
  }

  private createAuthorizationHeader = (authInfo: AuthInfo | null, overrideAuthKey: string | null): string => {
    const key = overrideAuthKey || authInfo?.authKey;
    return `X-Auth-Key ${key ?? ""}`;
  };
}
```

### Raw Axios Service Template (with auth)

**Use when:** calling APIMatic REST endpoints directly without the SDK client.

**Based on:** `src/infrastructure/services/api-service.ts`, `src/infrastructure/services/auth-service.ts`

```typescript
import axios from "axios";
import { AuthInfo, getAuthInfo } from "../../client-utils/auth-manager.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { envInfo } from "../env-info.js";
import { err, ok, Result } from "neverthrow";
import { handleServiceError, ServiceError } from "../service-error.js";

export class {PascalName}Service {
  private readonly apiBaseUrl = "https://api.apimatic.io" as const;

  public async {methodName}(
    configDir: DirectoryPath,
    shell: string,
    authKey: string | null
  ): Promise<Result<{ResponseType}, ServiceError>> {
    const authInfo: AuthInfo | null = await getAuthInfo(configDir.toString());
    if (authInfo === null && !authKey) {
      return err(ServiceError.UnAuthorized);
    }

    try {
      const token = authKey || authInfo?.authKey;
      const response = await this.axiosInstance(shell, token).get("/{endpoint}");

      if (response.status === 200) {
        return ok(response.data as {ResponseType});
      }
      return err(ServiceError.InvalidResponse);
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }

  private axiosInstance(shell: string, apiKey: string | undefined) {
    const headers: Record<string, string> = {
      "User-Agent": envInfo.getUserAgent(shell)
    };

    if (apiKey) {
      headers.Authorization = `X-Auth-Key ${apiKey}`;
    }

    return axios.create({
      baseURL: envInfo.getBaseUrl() ?? this.apiBaseUrl,
      headers
    });
  }
}
```

### Stateless Axios Service Template (no auth)

**Use when:** making external HTTP calls that don't require APIMatic authentication.

**Based on:** `src/infrastructure/services/file-download-service.ts`

```typescript
import axios from "axios";
import { err, ok, Result } from "neverthrow";
import { handleServiceError, ServiceError } from "../service-error.js";

export class {PascalName}Service {
  public async {methodName}(
    /* parameters */
  ): Promise<Result<{ResponseType}, ServiceError>> {
    try {
      const response = await axios.get(/* url */, {
        /* request config */
      });

      if (/* success condition */) {
        return ok(/* parsed result */);
      }
      return err(ServiceError.InvalidResponse);
    } catch (error: unknown) {
      return err(handleServiceError(error));
    }
  }
}
```
