import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { createCodeUsageGeneratorRegistry } from 'fumadocs-openapi/requests/generators';
import { curl } from 'fumadocs-openapi/requests/generators/curl';

// Only curl is generated for the request samples. Samples in other languages come from the
// `x-codeSamples` extension on each operation in the specification, which the same tabs
// render alongside the generated one.
const codeUsages = createCodeUsageGeneratorRegistry();
codeUsages.add('curl', curl);

export const OpenAPIPage = createOpenAPIPage({ codeUsages });
