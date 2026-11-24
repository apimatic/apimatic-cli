import type { HTMLAttributes } from 'react';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Card, type CardProps } from 'fumadocs-ui/components/card';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { externalHref } from '@/lib/base-path';
import { reportCodeCopy, reportCopies } from './code-copy';
import { PluginInstall } from './plugin-install';
import { PluginLanguage, PluginLanguages, PluginPlatforms } from './plugin-support';
import { SdkActions } from './sdk-actions';
import { SdkCard, SdkCards } from './sdk-cards';

type MDXComponents = Record<string, unknown>;

type HighlightedPre = HTMLAttributes<HTMLPreElement> & { 'data-language'?: string };

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    // Fumadocs' own, its copy button reporting the language the build names on the block.
    pre: ({ 'data-language': language = 'plaintext', ...props }: HighlightedPre) => (
      <CodeBlock {...props} Actions={reportCopies(() => reportCodeCopy(language))}>
        <Pre>{props.children}</Pre>
      </CodeBlock>
    ),
    // Fumadocs' own, which renders an external card as a plain link that the router's base never reaches.
    Card: ({ href, external, ...props }: CardProps) => (
      <Card {...props} external={external} href={external && href !== undefined ? externalHref(href) : href} />
    ),
    // Fumadocs' components beyond its defaults, so an author's page can use them without importing.
    Accordion,
    Accordions,
    File,
    Files,
    Folder,
    InlineTOC,
    Step,
    Steps,
    Tab,
    Tabs,
    TypeTable,
    // What the generated SDK and context plugin pages are made of.
    SdkCards,
    SdkCard,
    SdkActions,
    PluginInstall,
    PluginLanguages,
    PluginLanguage,
    PluginPlatforms,
    ...components
  };
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
