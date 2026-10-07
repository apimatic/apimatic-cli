import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { mediaAdapters } from '@/lib/media-adapters';
import { oauthCallbackPath } from '@/lib/oauth-callback';
import { renderExampleLayout } from './example-layout';
import { codeUsages, renderUsageTabs } from './usage-tabs';

export const OpenAPIPage = createOpenAPIPage({
  codeUsages,
  generateTypeScriptDefinitions: false,
  content: { renderAPIExampleLayout: renderExampleLayout, renderAPIExampleUsageTabs: renderUsageTabs },
  mediaAdapters,
  oauthRedirectUrl: oauthCallbackPath
});
