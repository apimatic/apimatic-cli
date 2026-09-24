import type { ContextPluginIdeName } from "../types";
import { ClaudeCodeIcon } from "./claude-code";
import { CursorIcon } from "./cursor";
import { VsCodeIcon } from "./vs-code";
import type { IconProps } from "./types";
import type { ReactNode } from "react";

/** The marks `<ContextPluginInstall>` resolves an IDE `icon` name against. */
export const ideIcons: Record<
  ContextPluginIdeName,
  (props: IconProps) => ReactNode
> = {
  "claude-code": ClaudeCodeIcon,
  cursor: CursorIcon,
  vscode: VsCodeIcon,
};
