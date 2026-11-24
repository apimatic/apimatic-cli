import type { ReactNode } from 'react';
import { CodeBlockTab, CodeBlockTabs, CodeBlockTabsList, CodeBlockTabsTrigger } from 'fumadocs-ui/components/codeblock';
import { useComponents } from 'fumadocs-openapi';
import { useCodeUsage } from 'fumadocs-openapi/operation';
import { createCodeUsageGeneratorRegistry } from 'fumadocs-openapi/requests/generators';
import { curl } from 'fumadocs-openapi/requests/generators/curl';
import { CodeSample } from '@/lib/code-samples';
import { REPLAY_MARKERS } from '@/lib/replay-markers';
import { SHRINKS_WITH_COLUMN, useExampleSelection } from './example-layout';

interface UsageTab {
  id: string;
  label: string;
  body: ReactNode;
}

// Not `curl`: Fumadocs files an operation's `x-codeSamples` under their language, which would replace it.
const CURL_USAGE_ID = 'portal-curl';

// Without a registry of its own, Fumadocs registers and bundles every request generator it has.
export const codeUsages = createCodeUsageGeneratorRegistry();
codeUsages.add(CURL_USAGE_ID, curl);

// A sample that shrinks with its tab, and scrolls inside it.
const SHRINKING_BLOCK = { className: SHRINKS_WITH_COLUMN, viewportProps: { className: 'min-h-0' } };

// The registry Fumadocs passes in adds the operation's `x-codeSamples`, which cannot follow the example selector.
export function renderUsageTabs(): ReactNode {
  return <UsageTabs />;
}

function UsageTabs() {
  const tabs: UsageTab[] = [
    { id: 'curl', label: curl.label ?? curl.lang, body: <CurlCode /> },
    ...CodeSample.listIn(useExampleSelection().operation).map((sample) => ({
      id: sample.lang,
      label: sample.label,
      body: <SampleCode sample={sample} />
    }))
  ];

  return (
    <CodeBlockTabs groupId="fumadocs_openapi_requests" defaultValue={tabs[0].id} className={SHRINKS_WITH_COLUMN}>
      <CodeBlockTabsList className="shrink-0">
        {tabs.map((tab) => (
          <CodeBlockTabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </CodeBlockTabsTrigger>
        ))}
      </CodeBlockTabsList>
      {tabs.map((tab) => (
        <CodeBlockTab key={tab.id} value={tab.id} className={SHRINKS_WITH_COLUMN}>
          {tab.body}
        </CodeBlockTab>
      ))}
    </CodeBlockTabs>
  );
}

function SampleCode({ sample }: Readonly<{ sample: CodeSample }>) {
  const { CodeBlock } = useComponents();
  const { examples, selected } = useExampleSelection();
  const source = sample.sourceFor(selected.id, examples.length);

  if (source === undefined) {
    return <p className="px-4 py-3 text-sm text-fd-muted-foreground">No {sample.label} sample for this example.</p>;
  }
  return <CodeBlock lang={sample.lang} code={source} codeblock={SHRINKING_BLOCK} />;
}

// Follows the playground's edits, so it carries its replay markers; Fumadocs writes a credential as `********`.
function CurlCode() {
  const { CodeBlock } = useComponents();
  const code = useCodeUsage(CURL_USAGE_ID);
  return code === undefined ? null : (
    <div {...REPLAY_MARKERS} className={`${REPLAY_MARKERS.className} ${SHRINKS_WITH_COLUMN}`}>
      <CodeBlock lang={curl.lang} code={code} codeblock={SHRINKING_BLOCK} />
    </div>
  );
}
