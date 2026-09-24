import type { ContextPluginIde } from "../types";

/** Fallback for `<ContextPluginInstall>` when no `ides` prop is given. */
export const defaultIdes: ContextPluginIde[] = [
  { id: 'claude-code', label: 'Claude Code', icon: 'claude-code' },
  { id: 'cursor', label: 'Cursor', icon: 'cursor' },
  { id: 'vscode', label: 'VS Code', icon: 'vscode' },
];
