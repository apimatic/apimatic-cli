import { useEffect, useState, type ReactNode } from 'react';
import { CodeBlockTab, CodeBlockTabs, CodeBlockTabsList, CodeBlockTabsTrigger } from 'fumadocs-ui/components/codeblock';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock.core';
import { useOperationContext, useRenderContext, useServerContext } from 'fumadocs-openapi/ui';
import { pathnameFromRequest } from 'fumadocs-openapi/requests/generators';
import { curl } from 'fumadocs-openapi/requests/generators/curl';
import { joinURL, resolveServerUrl } from '@fumadocs/api-docs/utils/url';
import { CodeSample } from '@/lib/code-samples';
import { useExampleSelection } from './example-layout';

interface UsageTab {
  id: string;
  label: string;
  body: ReactNode;
}

// The registry Fumadocs passes in adds the operation's `x-codeSamples`, which cannot follow the example selector.
export function renderUsageTabs(): ReactNode {
  return <UsageTabs />;
}

// cURL only stands in for SDK samples: beside them it would sample a request they disagree with.
function UsageTabs() {
  const samples = CodeSample.listIn(useExampleSelection().operation);
  const tabs: UsageTab[] =
    samples.length === 0
      ? [{ id: 'curl', label: curl.label ?? curl.lang, body: <CurlCode /> }]
      : samples.map((sample) => ({ id: sample.lang, label: sample.label, body: <SampleCode sample={sample} /> }));

  return (
    <CodeBlockTabs groupId="fumadocs_openapi_requests" defaultValue={tabs[0].id}>
      <CodeBlockTabsList>
        {tabs.map((tab) => (
          <CodeBlockTabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </CodeBlockTabsTrigger>
        ))}
      </CodeBlockTabsList>
      {tabs.map((tab) => (
        <CodeBlockTab key={tab.id} value={tab.id}>
          {tab.body}
        </CodeBlockTab>
      ))}
    </CodeBlockTabs>
  );
}

function SampleCode({ sample }: Readonly<{ sample: CodeSample }>) {
  const { examples, selected } = useExampleSelection();
  const source = sample.sourceFor(selected.id, examples.length);

  if (source === undefined) {
    return <p className="px-4 py-3 text-sm text-fd-muted-foreground">No {sample.label} sample for this example.</p>;
  }
  return <CodeBlock lang={sample.lang} code={source} />;
}

function CurlCode() {
  const { mediaAdapters } = useRenderContext();
  const { route } = useOperationContext();
  const request = useSelectedRequest();
  const serverUrl = useServerUrl();

  if (request === undefined) return null;
  const url = joinURL(serverUrl, pathnameFromRequest(route, request));
  return <CodeBlock lang={curl.lang} code={curl.generate({ ...request, url }, { mediaAdapters, custom: null })} />;
}

function CodeBlock({ lang, code }: Readonly<{ lang: string; code: string }>) {
  const { shiki, shikiOptions } = useRenderContext();
  return <DynamicCodeBlock lang={lang} code={code} highlighter={() => shiki.getOrInit()} options={shikiOptions} />;
}

// Fumadocs reports the playground's edits to the selected example through its listeners.
function useSelectedRequest() {
  const { examples, example, addListener, removeListener } = useOperationContext();
  const [request, setRequest] = useState(() => examples.find((item) => item.id === example)?.encoded);

  useEffect(() => {
    const listener = (_: unknown, encoded: typeof request) => setRequest(encoded);
    addListener(listener);
    return () => removeListener(listener);
  }, [addListener, removeListener]);
  return request;
}

function useServerUrl(): string {
  const { server } = useServerContext();
  const [origin, setOrigin] = useState<string>();

  useEffect(() => setOrigin(window.location.origin), []);
  return server && origin
    ? new URL(resolveServerUrl(server.url, server.variables), origin).href
    : 'https://example.com';
}
