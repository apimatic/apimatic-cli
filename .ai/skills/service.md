# /new-service

Scaffold a new infrastructure API service file following the project's layered architecture. Creates a single file at `src/infrastructure/services/{name}-service.ts`.

## Files Created

1. `src/infrastructure/services/{name}-service.ts` — Service class with typed methods returning `Result<T, ServiceError>`

## Information to Gather

Before generating, determine the following from the user or their description:

1. **Service name** — lowercase hyphenated (e.g., `copilot`, `billing`). File will be `{name}-service.ts`
2. **Class name** — PascalCase (e.g., `CopilotService`, `BillingService`)
3. **Variant** — one of:
   - `sdk-controller` — uses `@apimatic/sdk` controller classes via `apiClientFactory`
   - `axios-auth` — raw axios with auth (base URL, `axiosInstance` factory, auth pre-check)
   - `axios-stateless` — raw axios without auth (direct calls)
4. **Needs auth** — whether methods resolve auth via `getAuthInfo` + `authKey` parameter
5. **Initial method** — name, parameters, and return type for the first method to scaffold
6. **Response type** — type/interface for the success value (define inline or import from `src/types/`)

## SDK Controller Service Template

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

**SDK controller rules:**
- Always close file streams in `finally` block.
- Catch `ProblemDetailsError` first for 400/403 with structured error messages, then fall back to `handleServiceError()`.
- `ApiError` can be caught separately for specific status codes (e.g., 422).
- Auth resolution: `getAuthInfo(configDir.toString())` → `createAuthorizationHeader()` → `apiClientFactory.createApiClient()`.
- `createAuthorizationHeader` is a private arrow function.
- If the SDK method is async (polling), add a status polling loop — see `portal-service.ts` for the pattern.

## Raw Axios Service Template (with auth)

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

**Axios-auth rules:**
- Auth pre-check: `if (authInfo === null && !authKey) return err(ServiceError.UnAuthorized)` — before any API call.
- `axiosInstance` is a private method (not arrow function) that creates a fresh instance per call.
- Base URL uses `envInfo.getBaseUrl()` fallback for testing environments.
- Token resolution: `authKey || authInfo?.authKey` — flag override takes precedence.
- For services using a different base URL (e.g., auth service), use `envInfo.getAuthBaseUrl()` instead.
- Add `validateStatus: () => true` to the request config when you need to handle non-2xx responses without throwing.

## Stateless Axios Service Template (no auth)

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

      // Validate response
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

**Stateless rules:**
- No `axiosInstance` factory — use `axios.get()`/`axios.post()` directly.
- No auth imports or auth resolution.
- No base URL constant — URL passed as parameter or hardcoded per method.
- Response types can be defined as exported interfaces/types at the top of the file.

## Conventions Checklist

After generating, verify all of the following:

- [ ] All imports use `.js` extension (e.g., `../../client-utils/auth-manager.js`)
- [ ] File placed at `src/infrastructure/services/{name}-service.ts`
- [ ] Named export (not default): `export class {PascalName}Service`
- [ ] All public methods return `Promise<Result<T, ServiceError>>` using neverthrow
- [ ] Uses `ok()` and `err()` from neverthrow — never throws
- [ ] Catch blocks use `handleServiceError(error)` as fallback
- [ ] Auth uses `getAuthInfo(configDir.toString())` — note `.toString()` on DirectoryPath
- [ ] Auth header format: `X-Auth-Key ${key ?? ""}` (with space, not colon)
- [ ] `private readonly` for all field declarations
- [ ] `as const` on base URL string literals
- [ ] No `console.log` — services are silent; errors communicated via `Result`
- [ ] No raw string paths — use `DirectoryPath`, `FilePath`, `UrlPath`, `FileName`
- [ ] Response types defined as `interface` or `type` (in file or in `src/types/`)
- [ ] File streams closed in `finally` block when using `FileWrapper`

## Reference Files

Study these before generating to match the exact patterns:

| Pattern | File |
|---|---|
| SDK controller + async polling | `src/infrastructure/services/portal-service.ts` |
| SDK controller + FormData | `src/infrastructure/services/validation-service.ts` |
| Raw axios with auth + axiosInstance | `src/infrastructure/services/api-service.ts` |
| Raw axios with different base URL | `src/infrastructure/services/auth-service.ts` |
| Stateless axios (no auth) | `src/infrastructure/services/file-download-service.ts` |
| ServiceError class + handleServiceError | `src/infrastructure/service-error.ts` |
| SDK client factory (singleton) | `src/infrastructure/services/api-client-factory.ts` |
| envInfo (base URLs, user agent) | `src/infrastructure/env-info.ts` |
