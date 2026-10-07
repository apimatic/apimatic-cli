import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import type { ReactNode } from 'react';
import type { OAuthCallbackFailure } from '@/lib/oauth-callback';

/** What the OAuth callback says when it stays, instead of sending the browser back to the endpoint. */
export function AuthorizationFailure({ failure }: { failure: OAuthCallbackFailure }) {
  switch (failure.kind) {
    case 'providerError':
      // Ended, not refused: `server_error` and `temporarily_unavailable` arrive here too.
      return (
        <>
          <Explanation>
            The provider ended the authorization with <code>{failure.error}</code>
            {failure.description === null ? '.' : `: ${failure.description}`}
          </Explanation>
          <Action href={failure.page}>Back to the endpoint</Action>
        </>
      );
    case 'notStarted':
      return (
        <>
          <Explanation>
            This page completes an authorization started from an endpoint's playground, and none was started in this
            browser. Open the endpoint's page and authorize from there.
          </Explanation>
          <HomeAction />
        </>
      );
    case 'unknownPage':
      return (
        <>
          <Explanation>
            The authorization was not started from a page of this site, so it cannot be completed here. Open the
            endpoint's page and authorize from there.
          </Explanation>
          <HomeAction />
        </>
      );
  }
}

function Explanation({ children }: { children: ReactNode }) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Authorization could not be completed</h1>
      <p className="text-fd-muted-foreground max-w-md">{children}</p>
    </>
  );
}

// The page that started the sign-in is unknown here, so the home page is the one way back. It
// ignores a base path, as the callback's own address does (apimatic-io#2275).
function HomeAction() {
  return <Action href="/">Go to the home page</Action>;
}

function Action({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={buttonVariants({ color: 'primary', className: 'mt-4' })}>
      {children}
    </a>
  );
}
