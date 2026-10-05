import { createFileRoute } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { useEffect, useState } from 'react';
import { baseOptions } from '@/lib/layout.shared';
import { oauthReturnUrl } from '@/lib/oauth-callback';
import { portal } from '@/lib/portal';

// Published portals are static, so this page does in the browser what Fumadocs'
// `createOAuthHandler()` route does on a server.
export const Route = createFileRoute('/oauth/callback')({
  head: () => ({ meta: [{ title: `Sign-in | ${portal.name}` }, { name: 'robots', content: 'noindex' }] }),
  component: OAuthCallback
});

function OAuthCallback() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const target = oauthReturnUrl(document.cookie, window.location);
    if (target === null) setFailed(true);
    else window.location.replace(target);
  }, []);

  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex flex-col px-8 justify-center flex-1 text-center items-center gap-4">
        {failed ? (
          <>
            <h1 className="text-2xl font-semibold">Sign-in could not be completed</h1>
            <p className="text-fd-muted-foreground max-w-md">
              This page finishes a sign-in started from an endpoint's playground, and none was started in this browser.
              Go back to the endpoint and sign in from there.
            </p>
          </>
        ) : (
          <p className="text-fd-muted-foreground">Completing sign-in…</p>
        )}
      </div>
    </HomeLayout>
  );
}
