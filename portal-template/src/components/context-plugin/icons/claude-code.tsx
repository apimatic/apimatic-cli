// Brand mark: fixed colours in every theme, the one theme-token exception.

import type { IconProps } from "./types";

export function ClaudeCodeIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#D97757"
      strokeWidth="1.7"
      strokeLinecap="round"
      className="size-5"
      {...props}
    >
      <path d="M12 2.6v18.8M2.6 12h18.8M5.35 5.35l13.3 13.3M18.65 5.35 5.35 18.65" />
      <path
        d="M7.7 3.2 16.3 20.8M3.2 7.7l17.6 8.6M3.2 16.3 20.8 7.7M7.7 20.8 16.3 3.2"
        opacity="0.72"
      />
    </svg>
  );
}
