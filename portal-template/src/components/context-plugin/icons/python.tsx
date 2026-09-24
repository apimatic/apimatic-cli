// Brand mark: fixed colours in every theme, the one theme-token exception.

import type { IconProps } from "./types";

export function PythonIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="size-6.5" {...props}>
      <path
        fill="#3776AB"
        d="M12 2c-4 0-4 2-4 2v3h4v1H6s-3 0-3 5 3 5 3 5h2v-3s0-2 2-2h4s3 0 3-3V5s0-3-5-3zm-2 3a1 1 0 110 2 1 1 0 010-2z"
      />
      <path
        fill="#FFD43B"
        d="M12 22c4 0 4-2 4-2v-3h-4v-1h6s3 0 3-5-3-5-3-5h-2v3s0 2-2 2h-4s-3 0-3 3v3s0 3 5 3zm2-3a1 1 0 110-2 1 1 0 010 2z"
      />
    </svg>
  );
}
