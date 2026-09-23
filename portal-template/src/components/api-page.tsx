import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { createCodeUsageGeneratorRegistry } from 'fumadocs-openapi/requests/generators';
import { curl } from 'fumadocs-openapi/requests/generators/curl';
import { renderUsageTabs } from './usage-tabs';

// Only curl is generated for the request samples. Samples in other languages come from the
// `x-apimatic-codeSamples` extension on each operation in the specification, which the tabs
// render alongside the generated one (see `usage-tabs.tsx`).
const codeUsages = createCodeUsageGeneratorRegistry();
codeUsages.add('curl', curl);

export const OpenAPIPage = createOpenAPIPage({
  codeUsages,
  content: { renderAPIExampleUsageTabs: renderUsageTabs }
});
