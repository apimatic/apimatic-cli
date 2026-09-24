// Brand mark: fixed colours in every theme, the one theme-token exception.

import { ChipMark } from "./chip-mark";
import type { IconProps } from "./types";

export function DotNetIcon(props: IconProps) {
  return <ChipMark label=".NET" fill="#512BD4" size={8} {...props} />;
}
