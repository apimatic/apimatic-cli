import { useEffect, useState, type ReactNode } from 'react';
import { encodeRequestData } from 'fumadocs-openapi/encode';
import { CodeBlockTab, CodeBlockTabs, CodeBlockTabsList, CodeBlockTabsTrigger } from 'fumadocs-ui/components/codeblock';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock.core';
import { useOperationContext, useRenderContext, useServerContext } from 'fumadocs-openapi/ui';
import { pathnameFromRequest, type CodeUsageGenerator } from 'fumadocs-openapi/requests/generators';
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

function UsageTabs() {
  const { codeUsages } = useRenderContext();
  const tabs: UsageTab[] = [
    ...[...codeUsages.map()].map(([id, generator]) => ({
      id,
      label: generator.label ?? generator.lang,
      body: <GeneratedCode generator={generator} />
    })),
    ...CodeSample.listIn(useExampleSelection().operation).map((sample) => ({
      id: sample.lang,
      label: sample.label,
      body: <SampleCode sample={sample} />
    }))
  ];

  if (tabs.length === 0) return null;
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

function GeneratedCode({ generator }: Readonly<{ generator: CodeUsageGenerator }>) {
  const { mediaAdapters } = useRenderContext();
  const { route } = useOperationContext();
  const { selected, parameters } = useExampleSelection();
  const serverUrl = useServerUrl();

  const request = encodeRequestData(
    selected.data,
    mediaAdapters,
    parameters.map((parameter) => parameter.definition)
  );
  const url = joinURL(serverUrl, pathnameFromRequest(route, request));
  const code = generator.generate({ ...request, url }, { mediaAdapters, custom: null });
  return <CodeBlock lang={generator.lang} code={code} />;
}

function CodeBlock({ lang, code }: Readonly<{ lang: string; code: string }>) {
  const { shiki, shikiOptions } = useRenderContext();
  return <DynamicCodeBlock lang={lang} code={code} highlighter={() => shiki.getOrInit()} options={shikiOptions} />;
}

function useServerUrl(): string {
  const { server } = useServerContext();
  const [origin, setOrigin] = useState<string>();

  useEffect(() => setOrigin(window.location.origin), []);
  return server && origin
    ? new URL(resolveServerUrl(server.url, server.variables), origin).href
    : 'https://example.com';
}
