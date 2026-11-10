/**
 * One flow of the spec's oauth2 scheme, with the tokens it issues. The defaults are the fixed test
 * tokens a generated test is configured with.
 */
export type OAuth2Flow =
  | { readonly kind: 'clientCredentials'; readonly accessToken: string }
  | {
      /** With PKCE S256 and refresh tokens. Tokens are numbered: prefix + 1 at first, and each refresh issues the next. */
      readonly kind: 'authorizationCode';
      readonly authorizePath: string;
      readonly accessTokenPrefix: string;
      readonly refreshTokenPrefix: string;
    }
  | { readonly kind: 'password'; readonly username: string; readonly password: string; readonly accessToken: string }
  | {
      /** The token travels in the redirect's fragment, so this flow has no grant at the token endpoint. */
      readonly kind: 'implicit';
      readonly authorizePath: string;
      readonly accessToken: string;
    };

/** A flow with a consent step: the user agent is sent to the authorize path and redirected back with what the flow hands out. */
export type RedirectingFlow = Extract<OAuth2Flow, { authorizePath: string }>;

export const OAUTH2_DEFAULTS = {
  expiresIn: 3600,
  clientCredentialsAccessToken: 'cc-access-token',
  accessTokenPrefix: 'ac-access-token-',
  refreshTokenPrefix: 'ac-refresh-token-',
  username: 'test-user',
  password: 'test-password',
  passwordAccessToken: 'pw-access-token',
  implicitAccessToken: 'im-access-token'
} as const;

/**
 * An OAuth2 authorization server the mock runs beside the API, described by one `oauth2` stub.
 * Schemes that name different token URLs get one stub, and one server, per token path.
 */
export interface OAuth2Settings {
  readonly tokenPath: string;
  /** In stub order, which is the order a refusal lists the offered grants in. */
  readonly flows: readonly OAuth2Flow[];
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scopes: readonly string[];
  /** Token lifetime in seconds; the command's --token-ttl overrides it. */
  readonly expiresIn: number;
}

export function isRedirecting(flow: OAuth2Flow): flow is RedirectingFlow {
  return flow.kind === 'authorizationCode' || flow.kind === 'implicit';
}

/** The grant types a flow answers at the token endpoint, in the order a refusal lists them. */
export function grantTypesOf(flow: OAuth2Flow): readonly string[] {
  switch (flow.kind) {
    case 'clientCredentials':
      return ['client_credentials'];
    case 'authorizationCode':
      return ['authorization_code', 'refresh_token'];
    case 'password':
      return ['password'];
    case 'implicit':
      return [];
  }
}

/** The response_type that selects a flow among those sharing an authorize path. */
export function responseTypeOf(flow: RedirectingFlow): string {
  return flow.kind === 'authorizationCode' ? 'code' : 'token';
}

/** Every path a server answers on: the token path, then each authorize path once. No two servers may claim one. */
export function pathsOf(settings: OAuth2Settings): string[] {
  const authorizePaths = settings.flows.filter(isRedirecting).map((flow) => flow.authorizePath);
  return [...new Set([settings.tokenPath, ...authorizePaths])];
}
