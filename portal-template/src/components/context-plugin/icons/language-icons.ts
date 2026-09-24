import type { ContextPluginLanguageName } from "../types";
import { DotNetIcon } from "./dotnet";
import { GoIcon } from "./go";
import { JavaIcon } from "./java";
import { PhpIcon } from "./php";
import { PythonIcon } from "./python";
import { RubyIcon } from "./ruby";
import { TypeScriptIcon } from "./typescript";
import type { IconProps } from "./types";
import type { ReactNode } from "react";

/** The marks the available-languages row resolves an `icon` name against. */
export const languageIcons: Record<
  ContextPluginLanguageName,
  (props: IconProps) => ReactNode
> = {
  dotnet: DotNetIcon,
  typescript: TypeScriptIcon,
  python: PythonIcon,
  java: JavaIcon,
  php: PhpIcon,
  ruby: RubyIcon,
  go: GoIcon,
};
