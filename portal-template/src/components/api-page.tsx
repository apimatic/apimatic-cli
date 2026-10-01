import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { mediaAdapters } from '@/lib/media-adapters';
import { CodeBlock } from './code-block';
import { renderExampleLayout } from './example-layout';
import { codeUsages, renderUsageTabs } from './usage-tabs';

export const OpenAPIPage = createOpenAPIPage({
  codeUsages,
  generateTypeScriptDefinitions: false,
  components: { CodeBlock },
  content: { renderAPIExampleLayout: renderExampleLayout, renderAPIExampleUsageTabs: renderUsageTabs },
  mediaAdapters
});
