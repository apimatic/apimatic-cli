import type { Plugin } from 'vite';

const DIALOG = /\/fumadocs-openapi\/dist\/playground\/components\/oauth-dialog\.js$/;

const CLIENT_CREDENTIALS_REQUEST =
  /headers: \{ "Content-Type": "application\/x-www-form-urlencoded" \},\s*body: new URLSearchParams\(\{\s*grant_type: "client_credentials",\s*client_id: values\.clientId,\s*client_secret: values\.clientSecret,\s*scope: scopes\.join\("\+"\)\s*\}\)/;

const BASIC_AUTH_REQUEST = `headers: {
  "Content-Type": "application/x-www-form-urlencoded",
  Authorization: \`Basic \${btoa(\`\${values.clientId}:\${values.clientSecret}\`)}\`
},
body: new URLSearchParams({
  grant_type: "client_credentials",
  ...(scopes.length > 0 && { scope: scopes.join("+") })
})`;

/**
 * Sends the client credentials of the playground's token request in a Basic Authorization
 * header, which RFC 6749 obliges every server to accept, where fumadocs sends them in the body,
 * which PayPal among others refuses. Given to the dependency optimizer too, since the preview
 * pre-bundles fumadocs where no other plugin reaches it.
 */
export function oauthClientAuth(): Plugin {
  return {
    name: 'apimatic:oauth-client-auth',
    transform(code, id) {
      if (!DIALOG.test(id.split('?')[0].replaceAll('\\', '/'))) return;
      return withBasicClientAuth(code);
    }
  };
}

export function withBasicClientAuth(code: string): string {
  if (!CLIENT_CREDENTIALS_REQUEST.test(code)) {
    throw new Error("[OAuth] fumadocs-openapi's client credentials request has changed; update oauth-client-auth.ts.");
  }
  return code.replace(CLIENT_CREDENTIALS_REQUEST, BASIC_AUTH_REQUEST);
}
