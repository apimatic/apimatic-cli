import defaultMdxComponents from 'fumadocs-ui/mdx';
import { PluginInstall } from './plugin-install';
import { PluginLanguage, PluginLanguages, PluginPlatforms } from './plugin-support';
import { SdkActions } from './sdk-actions';
import { SdkCard, SdkCards } from './sdk-cards';

type MDXComponents = Record<string, unknown>;

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
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
