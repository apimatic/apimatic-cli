import { createFileRoute } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { useEffect, useState } from 'react';
import { AuthorizationFailure } from '@/components/authorization-failure';
import { baseOptions } from '@/lib/layout.shared';
import { forgetStartingPage, oauthCallback, type OAuthCallback, type OAuthCallbackFailure } from '@/lib/oauth-callback';
import { portal } from '@/lib/portal';

// Published portals are static, so this page does in the browser what Fumadocs'
// `createOAuthHandler()` route does on a server.
export const Route = createFileRoute('/oauth/callback')({
  head: () => ({ meta: [{ title: `Authorization | ${portal.name}` }, { name: 'robots', content: 'noindex' }] }),
  component: OAuthCallbackPage
});

let completion: OAuthCallback | undefined;

/**
 * Reading the cookie and sending the browser on can each happen only once per page load, not
 * once per mount: the StrictMode `portal serve` runs under mounts the page twice, and the second
 * mount would find the cookie gone. The answer is kept, so a later mount in the same load, such
 * as Back after leaving through the header, shows the same outcome. Every arrival from a provider
 * is a new load.
 */
function completeSignIn(): OAuthCallback {
  if (completion === undefined) {
    completion = oauthCallback(document.cookie, window.location);
    forgetStartingPage();
    if (completion.kind === 'return') window.location.replace(completion.url);
  }
  return completion;
}

function OAuthCallbackPage() {
  // Null until the effect has read the cookie, which the prerendered page cannot.
  const [failure, setFailure] = useState<OAuthCallbackFailure | null>(null);

  useEffect(() => {
    const callback = completeSignIn();
    if (callback.kind !== 'return') setFailure(callback);
  }, []);

  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex flex-col px-8 justify-center flex-1 text-center items-center gap-4">
        {failure === null ? (
          <p className="text-fd-muted-foreground">Completing authorization…</p>
        ) : (
          <AuthorizationFailure failure={failure} />
        )}
      </div>
    </HomeLayout>
  );
}
