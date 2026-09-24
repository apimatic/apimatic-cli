import type { ReactNode } from 'react';
import { CodeBlockTab, CodeBlockTabs, CodeBlockTabsList, CodeBlockTabsTrigger } from 'fumadocs-ui/components/codeblock';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock.core';
import { useRenderContext } from 'fumadocs-openapi/ui';
import { CodeSample } from '@/lib/code-samples';
import { useExampleSelection } from './example-layout';

// The registry Fumadocs passes in adds the operation's `x-codeSamples`, which cannot follow the example selector.
export function renderUsageTabs(): ReactNode {
  return <UsageTabs />;
}

function UsageTabs() {
  const samples = CodeSample.listIn(useExampleSelection().operation);

  if (samples.length === 0) return null;
  return (
    <CodeBlockTabs groupId="fumadocs_openapi_requests" defaultValue={samples[0].lang}>
      <CodeBlockTabsList>
        {samples.map((sample) => (
          <CodeBlockTabsTrigger key={sample.lang} value={sample.lang}>
            {sample.label}
          </CodeBlockTabsTrigger>
        ))}
      </CodeBlockTabsList>
      {samples.map((sample) => (
        <CodeBlockTab key={sample.lang} value={sample.lang}>
          <SampleCode sample={sample} />
        </CodeBlockTab>
      ))}
    </CodeBlockTabs>
  );
}

function SampleCode({ sample }: Readonly<{ sample: CodeSample }>) {
  const { shiki, shikiOptions } = useRenderContext();
  const { examples, selected } = useExampleSelection();
  const source = sample.sourceFor(selected.id, examples.length);

  if (source === undefined) {
    return <p className="px-4 py-3 text-sm text-fd-muted-foreground">No {sample.label} sample for this example.</p>;
  }
  return (
    <DynamicCodeBlock lang={sample.lang} code={source} highlighter={() => shiki.getOrInit()} options={shikiOptions} />
  );
}
