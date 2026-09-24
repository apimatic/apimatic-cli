import type { ContextPluginAchievement } from "../types";

/** Rendered by `<ContextPluginAchievements />` when no `items` prop is given. */
export const defaultAchievements: ContextPluginAchievement[] = [
  {
    id: 'prompt-to-production',
    title: 'From prompt to production',
    description:
      'Describe what you need and your agent builds it end to end. Always-current API context and correct auth flows are built in — no reference docs, no guesswork, no fixing.',
  },
  {
    id: 'migrating',
    title: 'Migrating an existing integration',
    description:
      'Your agent gets exact API contracts — current methods and correct auth patterns, and produces production-ready output.',
  },
  {
    id: 'vibe-coding',
    title: 'Vibe coding with agents',
    description:
      'Build complete apps with one prompt. No failed attempts, no debugging AI mistakes. Just a working app, first try.',
  },
];
