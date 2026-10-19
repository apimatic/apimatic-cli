import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { PluginInstall } from './plugin-install';
import { PluginLanguage, PluginLanguages, PluginPlatforms } from './plugin-support';
import { SdkActions } from './sdk-actions';
import { SdkCard, SdkCards } from './sdk-cards';

type MDXComponents = Record<string, unknown>;

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
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
