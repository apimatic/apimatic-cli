import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { withBasePath } from '@/lib/base-path';
import { mediaAdapters } from '@/lib/media-adapters';
import { oauthCallbackPath } from '@/lib/oauth-callback';
import { ApiMarkdown } from './api-markdown';
import { renderExampleLayout } from './example-layout';
import { codeUsages, renderUsageTabs } from './usage-tabs';

export const OpenAPIPage = createOpenAPIPage({
  codeUsages,
  generateTypeScriptDefinitions: false,
  content: { renderAPIExampleLayout: renderExampleLayout, renderAPIExampleUsageTabs: renderUsageTabs },
  components: { Markdown: ApiMarkdown },
  mediaAdapters,
  oauthRedirectUrl: withBasePath(oauthCallbackPath),
  // Portals under paths of one host keep their playground's saved values apart; at the root the keys stay Fumadocs' own.
  storageKeyPrefix: `fumadocs-openapi-${withBasePath('/').slice(1)}`
});
