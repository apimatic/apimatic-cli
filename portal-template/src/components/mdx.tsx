import defaultMdxComponents from 'fumadocs-ui/mdx';
import { SdkActions, SdkCard, SdkGrid } from './sdk';
import { ContextPluginAchievements, ContextPluginInstall } from './context-plugin';

type MDXComponents = Record<string, unknown>;

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    SdkActions,
    SdkCard,
    SdkGrid,
    ContextPluginAchievements,
    ContextPluginInstall,
    ...components
  };
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
