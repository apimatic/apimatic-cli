import { createFileRoute } from '@tanstack/react-router';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { useEffect, useState, type ReactNode } from 'react';
import { baseOptions } from '@/lib/layout.shared';
import { forgetStartingPage, oauthCallback, type OAuthCallback } from '@/lib/oauth-callback';
import { portal } from '@/lib/portal';

// Published portals are static, so this page does in the browser what Fumadocs'
// `createOAuthHandler()` route does on a server.
export const Route = createFileRoute('/oauth/callback')({
  head: () => ({ meta: [{ title: `Sign-in | ${portal.name}` }, { name: 'robots', content: 'noindex' }] }),
  component: OAuthCallbackPage
});

/** Every outcome but sending the browser on, which leaves this page before it renders again. */
type Stay = Exclude<OAuthCallback, { kind: 'return' }>;

function OAuthCallbackPage() {
  // Null until the effect has read the cookie, which the prerendered page cannot.
  const [outcome, setOutcome] = useState<Stay | null>(null);

  useEffect(() => {
    const callback = oauthCallback(document.cookie, window.location);
    forgetStartingPage();
    if (callback.kind === 'return') window.location.replace(callback.url);
    else setOutcome(callback);
  }, []);

  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex flex-col px-8 justify-center flex-1 text-center items-center gap-4">
        {outcome === null ? (
          <p className="text-fd-muted-foreground">Completing sign-in…</p>
        ) : (
          <Failure outcome={outcome} />
        )}
      </div>
    </HomeLayout>
  );
}

function Failure({ outcome }: { outcome: Stay }) {
  switch (outcome.kind) {
    case 'providerError':
      return (
        <>
          <Explanation>
            The provider refused the sign-in with <code>{outcome.error}</code>
            {outcome.description === null ? '.' : `: ${outcome.description}`}
          </Explanation>
          <a href={outcome.page} className={buttonVariants({ color: 'primary', className: 'mt-4' })}>
            Back to the endpoint
          </a>
        </>
      );
    case 'notStarted':
      return (
        <Explanation>
          This page finishes a sign-in started from an endpoint's playground, and none was started in this browser. Go
          back to the endpoint and sign in from there.
        </Explanation>
      );
    case 'unknownPage':
      return (
        <Explanation>
          The sign-in was not started from a page of this site, so it cannot be finished here. Go back to the endpoint
          and sign in from there.
        </Explanation>
      );
  }
}

function Explanation({ children }: { children: ReactNode }) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Sign-in could not be completed</h1>
      <p className="text-fd-muted-foreground max-w-md">{children}</p>
    </>
  );
}
