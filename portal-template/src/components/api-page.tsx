import { lazy, Suspense } from 'react';
import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { withBasePath } from '@/lib/base-path';
import { mediaAdapters } from '@/lib/media-adapters';
import { oauthCallbackPath } from '@/lib/oauth-callback';
import { REPLAY_MARKERS } from '@/lib/replay-markers';
import { ApiMarkdown } from './api-markdown';
import { ReportedCodeBlock } from './code-copy';
import { EndpointBar } from './endpoint-bar';
import { renderExampleLayout } from './example-layout';
import { codeUsages, renderUsageTabs } from './usage-tabs';

// Its own chunk, as Fumadocs loads it: the playground's forms are not in every page's bundle.
const Playground = lazy(() => import('./playground'));

export const OpenAPIPage = createOpenAPIPage({
  codeUsages,
  generateTypeScriptDefinitions: false,
  content: { renderAPIExampleLayout: renderExampleLayout, renderAPIExampleUsageTabs: renderUsageTabs },
  components: { Markdown: ApiMarkdown, CodeBlock: ReportedCodeBlock },
  mediaAdapters,
  oauthRedirectUrl: withBasePath(oauthCallbackPath),
  playground: {
    // Session replay tools a GTM tag loads record the page's text and input; each marker keeps its tool out of the playground.
    render: ({ method, path }) => (
      <div {...REPLAY_MARKERS} data-portal-playground="">
        <Suspense fallback={<EndpointBar method={method} route={path} />}>
          <Playground />
        </Suspense>
      </div>
    )
  },
  // Portals under paths of one host keep their playground's saved values apart; at the root the keys stay Fumadocs' own.
  storageKeyPrefix: `fumadocs-openapi-${withBasePath('/').slice(1)}`
});
