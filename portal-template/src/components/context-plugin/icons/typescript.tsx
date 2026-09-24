// Brand mark: fixed colours in every theme, the one theme-token exception.

import { ChipMark } from "./chip-mark";
import type { IconProps } from "./types";

export function TypeScriptIcon(props: IconProps) {
  return <ChipMark label="TS" fill="#3178C6" {...props} />;
}
