import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { createCodeUsageGeneratorRegistry } from 'fumadocs-openapi/requests/generators';
import { curl } from 'fumadocs-openapi/requests/generators/curl';
import { renderExampleLayout } from './example-layout';
import { renderUsageTabs } from './usage-tabs';

const codeUsages = createCodeUsageGeneratorRegistry();
codeUsages.add('curl', curl);

export const OpenAPIPage = createOpenAPIPage({
  codeUsages,
  content: { renderAPIExampleLayout: renderExampleLayout, renderAPIExampleUsageTabs: renderUsageTabs }
});
