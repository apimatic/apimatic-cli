import type { ContextPluginLanguage } from "../types";

/** Fallback languages, in reference order; four render as "coming soon". */
export const defaultLanguages: ContextPluginLanguage[] = [
  { id: 'dotnet', label: '.NET', icon: 'dotnet' },
  { id: 'typescript', label: 'TypeScript', icon: 'typescript' },
  { id: 'python', label: 'Python', icon: 'python' },
  { id: 'java', label: 'Java', icon: 'java', comingSoon: true },
  { id: 'php', label: 'PHP', icon: 'php', comingSoon: true },
  { id: 'ruby', label: 'Ruby', icon: 'ruby', comingSoon: true },
  { id: 'go', label: 'Go', icon: 'go', comingSoon: true },
];
