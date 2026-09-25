import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { createCodeUsageGeneratorRegistry } from 'fumadocs-openapi/requests/generators';
import { CodeBlock } from './code-block';
import { renderExampleLayout } from './example-layout';
import { renderUsageTabs } from './usage-tabs';

export const OpenAPIPage = createOpenAPIPage({
  // Without a registry of its own, Fumadocs registers and bundles every request generator it has.
  codeUsages: createCodeUsageGeneratorRegistry(),
  generateTypeScriptDefinitions: false,
  components: { CodeBlock },
  content: { renderAPIExampleLayout: renderExampleLayout, renderAPIExampleUsageTabs: renderUsageTabs }
});
