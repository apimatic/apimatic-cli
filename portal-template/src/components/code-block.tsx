import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock.core';
import { useRenderContext } from 'fumadocs-openapi/ui';

// Fumadocs passes `JSON.stringify(example.value)`, which is undefined for an example with no `value`.
export function CodeBlock({ lang, code }: Readonly<{ lang: string; code: string | undefined }>) {
  const { shiki, shikiOptions } = useRenderContext();
  if (code === undefined) return null;
  return <DynamicCodeBlock lang={lang} code={code} highlighter={() => shiki.getOrInit()} options={shikiOptions} />;
}
