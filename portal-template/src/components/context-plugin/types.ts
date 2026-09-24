import type { ReactNode } from 'react';

/** Marks bundled in `./icons`; any other string or `ReactNode` renders as-is. */
export type ContextPluginIdeName = 'claude-code' | 'cursor' | 'vscode';

/** Names of the language marks bundled in `./icons`. */
export type ContextPluginLanguageName =
  | 'dotnet'
  | 'typescript'
  | 'python'
  | 'java'
  | 'php'
  | 'ruby'
  | 'go';

export interface ContextPluginIde {
  /** React key. Falls back to the array index. */
  id?: string;
  label: ReactNode;
  /** A name from {@link ContextPluginIdeName}, or any node. */
  icon?: ContextPluginIdeName | ReactNode;
  /** Renders the chip as a link. Omit it for a static chip. */
  href?: string;
  /** Open in a new tab. Defaults to `true` for absolute URLs. */
  external?: boolean;
}

export interface ContextPluginLanguage {
  /** React key. Falls back to the array index. */
  id?: string;
  /** Doubles as the mark's hover label and accessible name. */
  label: string;
  /** A name from {@link ContextPluginLanguageName}, or any node. */
  icon?: ContextPluginLanguageName | ReactNode;
  /** Desaturates the mark and appends the panel's `comingSoonLabel` to its hover label. */
  comingSoon?: boolean;
  /** Replaces the composed hover label outright. */
  tooltip?: ReactNode;
}

export interface ContextPluginInstallProps {
  /** @defaultValue `'Install context plugin for API'` */
  title?: ReactNode;
  /** The one-liner shown in the copyable command block. */
  command?: string;
  /** Optional caption in the command block's header. */
  commandTitle?: ReactNode;
  /** Small print under the command block. */
  note?: ReactNode;
  /** @defaultValue `'SUPPORTED IDES'` */
  idesLabel?: ReactNode;
  /** Omit for `defaultIdes`; pass `[]` to hide the row. */
  ides?: ContextPluginIde[];
  /** @defaultValue `'AVAILABLE LANGUAGES'` */
  languagesLabel?: ReactNode;
  /** Omit for `defaultLanguages`; pass `[]` to hide the row. */
  languages?: ContextPluginLanguage[];
  /** Appended as `'<label> - <comingSoonLabel>'`. @defaultValue `'coming soon'` */
  comingSoonLabel?: string;
  /** @defaultValue `true` */
  showNote?: boolean;
  /** @defaultValue `true` */
  showIdes?: boolean;
  /** @defaultValue `true` */
  showLanguages?: boolean;
  className?: string;
}

export interface ContextPluginAchievement {
  /** React key. Falls back to the array index. */
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Rendered in a bordered chip above the title. Omitted by default. */
  icon?: ReactNode;
}

export interface ContextPluginAchievementCardProps extends ContextPluginAchievement {
  className?: string;
}

/** How many cards sit side by side once the container is wide enough. */
export type ContextPluginColumns = 1 | 2 | 3 | 4;

export interface ContextPluginAchievementsProps {
  /** `<ContextPluginAchievementCard />` elements. Takes precedence over `items`. */
  children?: ReactNode;
  /** Omit both for `defaultAchievements`; pass `[]` for the empty state. */
  items?: ContextPluginAchievement[];
  /** Cards per row; omit to auto-fit by `minCardWidth`. Collapses to one when narrow. */
  columns?: ContextPluginColumns;
  /** Only used when `columns` is omitted. @defaultValue `'15rem'` */
  minCardWidth?: string;
  /** Rendered when there is nothing to show. */
  empty?: ReactNode;
  className?: string;
}
