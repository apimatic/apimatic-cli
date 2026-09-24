// Brand mark: fixed colours in every theme, the one theme-token exception.

import type { IconProps } from "./types";

export function CursorIcon(props: IconProps) {
  // Mid-range tones: a white cube vanishes on a light card, a black one on dark.
  return (
    <svg viewBox="0 0 24 24" className="size-5" {...props}>
      <path d="M12 2 20.66 7 12 12 3.34 7z" fill="#C4C4C4" />
      <path d="M20.66 7v10L12 22V12z" fill="#949494" />
      <path d="M3.34 7 12 12v10L3.34 17z" fill="#646464" />
    </svg>
  );
}
