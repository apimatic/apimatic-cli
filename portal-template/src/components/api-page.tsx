import { lazy, Suspense } from 'react';
import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { withBasePath } from '@/lib/base-path';
import { mediaAdapters } from '@/lib/media-adapters';
import { oauthCallbackPath } from '@/lib/oauth-callback';
import { ApiMarkdown } from './api-markdown';
import { renderExampleLayout } from './example-layout';
import { codeUsages, renderUsageTabs } from './usage-tabs';

// Its own chunk, as Fumadocs loads it: the playground's forms are not in every page's bundle.
const PlaygroundClient = lazy(() => import('fumadocs-openapi/ui/playground/client'));

export const OpenAPIPage = createOpenAPIPage({
  codeUsages,
  generateTypeScriptDefinitions: false,
  content: { renderAPIExampleLayout: renderExampleLayout, renderAPIExampleUsageTabs: renderUsageTabs },
  components: { Markdown: ApiMarkdown },
  mediaAdapters,
  oauthRedirectUrl: withBasePath(oauthCallbackPath),
  playground: {
    // Session replay tools a GTM tag loads record the page's text and input; each marker keeps its tool out of the playground.
    render: () => (
      <div
        className="ph-no-capture fs-exclude rr-block amp-block"
        data-hj-suppress=""
        data-clarity-mask="True"
        data-private=""
        data-portal-playground=""
      >
        <Suspense fallback={null}>
          <PlaygroundClient />
        </Suspense>
      </div>
    )
  },
  // Portals under paths of one host keep their playground's saved values apart; at the root the keys stay Fumadocs' own.
  storageKeyPrefix: `fumadocs-openapi-${withBasePath('/').slice(1)}`
});
