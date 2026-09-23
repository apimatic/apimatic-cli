import { useMemo } from 'react';
import { createOpenAPIPage, type OpenAPIPageProps_Spec } from 'fumadocs-openapi/ui';
import {
  createCodeUsageGeneratorRegistry,
  type CodeUsageGeneratorRegistry
} from 'fumadocs-openapi/requests/generators';
import { curl } from 'fumadocs-openapi/requests/generators/curl';

const CODE_SAMPLES_EXTENSION = 'x-apimatic-codeSamples';

type Document = OpenAPIPageProps_Spec['payload']['bundled'];
type JsonObject = Record<string, unknown>;
type Example = [id: string, value: unknown];

interface CodeSample {
  lang: string;
  label: string;
  sources: Record<string, string>;
}

// fumadocs-openapi 11 reads a tab's code from the page's registry, never the operation's.
export function OpenAPIPage(props: OpenAPIPageProps_Spec) {
  const document = props.payload.bundled;
  const Page = useMemo(() => createOpenAPIPage({ codeUsages: codeUsagesOf(document) }), [document]);
  return <Page {...props} />;
}

function codeUsagesOf(document: Document): CodeUsageGeneratorRegistry {
  const codeUsages = createCodeUsageGeneratorRegistry();
  codeUsages.add('curl', curl);
  for (const operation of operationsOf(document)) {
    const examples = bodyExamplesOf(operation, document);
    for (const sample of codeSamplesOf(operation)) {
      codeUsages.add(sample.lang, {
        lang: sample.lang,
        label: sample.label,
        generate: (request) => sourceFor(sample, selectedExample(request.body, examples))
      });
    }
  }
  return codeUsages;
}

function sourceFor(sample: CodeSample, exampleId: string | undefined): string {
  const sources = sample.sources;
  return (exampleId !== undefined && sources[exampleId]) || Object.values(sources)[0];
}

// The selector hands a sample only the chosen example's request, so the example is recognised by its body.
function selectedExample(body: unknown, examples: Example[]): string | undefined {
  const selected = JSON.stringify(body);
  return examples.find(([, value]) => JSON.stringify(value) === selected)?.[0];
}

function operationsOf(document: Document): JsonObject[] {
  return Object.values(asObject(document.paths))
    .flatMap((pathItem) => Object.values(asObject(pathItem)))
    .filter(isObject);
}

function codeSamplesOf(operation: JsonObject): CodeSample[] {
  const samples = operation[CODE_SAMPLES_EXTENSION];
  return Array.isArray(samples) ? samples : [];
}

function bodyExamplesOf(operation: JsonObject, document: Document): Example[] {
  const requestBody = resolve(operation.requestBody, document);
  return Object.values(asObject(requestBody.content))
    .map((media) => resolve(media, document))
    .flatMap((media) => Object.entries(asObject(media.examples)))
    .map(([id, example]): Example => [id, resolve(example, document).value]);
}

function resolve(node: unknown, document: Document): JsonObject {
  const object = asObject(node);
  const reference = object.$ref;
  if (typeof reference !== 'string' || !reference.startsWith('#/')) {
    return object;
  }
  const target = reference
    .slice(2)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<unknown>((parent, segment) => asObject(parent)[segment], document);
  return asObject(target);
}

function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
