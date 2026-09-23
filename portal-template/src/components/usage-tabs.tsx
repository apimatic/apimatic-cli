import { useEffect, useMemo, useState } from 'react';
import { CodeBlockTab, CodeBlockTabs, CodeBlockTabsList, CodeBlockTabsTrigger } from 'fumadocs-ui/components/codeblock';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock.core';
import { useOperationContext, useRenderContext, useServerContext } from 'fumadocs-openapi/ui';
import { pathnameFromRequest } from 'fumadocs-openapi/requests/generators';
import { tabContent, usageTabs, type UsageTab } from '@/lib/code-samples';

/**
 * Replaces Fumadocs' request-sample tabs so SDK samples follow the example dropdown. The
 * per-operation registry Fumadocs passes in is not used: it adds the operation's
 * `x-codeSamples`, which the portal does not render, since a static entry cannot follow the
 * dropdown (and Fumadocs 11.4.1 renders them empty anyway).
 */
export function renderUsageTabs() {
  return <UsageTabs />;
}

function UsageTabs() {
  const { schema, codeUsages } = useRenderContext();
  const { route, examples } = useOperationContext();
  // The operation itself is not passed to this renderer, so it is found again by route and method.
  const method = examples[0]?.data.method;

  const tabs = useMemo(() => {
    const pathItem = schema.resolve(schema.dereferenced.paths?.[route]) as Record<string, unknown> | undefined;
    return usageTabs(codeUsages.map(), method ? pathItem?.[method] : undefined);
  }, [codeUsages, schema, route, method]);

  if (tabs.length === 0) return null;
  return (
    <CodeBlockTabs groupId="fumadocs_openapi_requests" defaultValue={tabs[0][0]}>
      <CodeBlockTabsList>
        {tabs.map(([id, tab]) => (
          <CodeBlockTabsTrigger key={id} value={id}>
            {tab.label}
          </CodeBlockTabsTrigger>
        ))}
      </CodeBlockTabsList>
      {tabs.map(([id, tab]) => (
        <CodeBlockTab key={id} value={id}>
          <UsageTabContent tab={tab} />
        </CodeBlockTab>
      ))}
    </CodeBlockTabs>
  );
}

// Follows Fumadocs' own tab body (`ui/operation/usage-tabs.js`), so generated samples such as
// curl still track playground edits.
function UsageTabContent({ tab }: Readonly<{ tab: UsageTab }>) {
  const { mediaAdapters, shiki, shikiOptions } = useRenderContext();
  const { examples, example: selected, route, addListener, removeListener } = useOperationContext();
  const { server } = useServerContext();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState(() => examples.find((example) => example.id === selected)?.encoded);

  useEffect(() => {
    const listener = (_: unknown, encoded: typeof data) => setData(encoded);
    addListener(listener);
    setMounted(true);
    return () => removeListener(listener);
  }, [addListener, removeListener]);

  const content = useMemo(() => tabContent(tab, selected, examples.length), [tab, selected, examples.length]);
  const code = useMemo(() => {
    if (content.kind === 'snippet') return content.source;
    if (content.kind === 'missing' || !data || !('generator' in tab)) return;
    // Resolved only after mount so the prerendered HTML matches the first client render.
    const base =
      server && mounted
        ? new URL(resolveServerUrl(server.url, server.variables), window.location.origin).href
        : 'https://example.com';
    return tab.generator.generate(
      { ...data, url: joinURL(base, pathnameFromRequest(route, data)) },
      { mediaAdapters, custom: null }
    );
  }, [content, tab, data, server, mounted, route, mediaAdapters]);

  if (content.kind === 'missing') {
    return <p className="px-4 py-3 text-sm text-fd-muted-foreground">No {tab.label} sample for this example.</p>;
  }
  if (!code) return null;
  return <DynamicCodeBlock lang={tab.lang} code={code} highlighter={() => shiki.getOrInit()} options={shikiOptions} />;
}

// Copies of `@fumadocs/api-docs/utils/url`, which is not a direct dependency of the template.
function joinURL(base: string, pathname: string): string {
  const path = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  const root = base.endsWith('/') ? base.slice(0, -1) : base;
  return path.length > 0 ? `${root}/${path}` : root;
}

function resolveServerUrl(template: string, variables: Record<string, string>): string {
  let url = template;
  for (const [key, value] of Object.entries(variables)) url = url.replaceAll(`{${key}}`, value);
  return url;
}
