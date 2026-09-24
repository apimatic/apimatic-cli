// Brand mark: fixed colours in every theme, the one theme-token exception.

import type { IconProps } from "./types";

/** A rounded brand tile with a short label, the shape the reference uses. */
export function ChipMark({
  label,
  fill,
  color = "#fff",
  size = 11,
  ...props
}: IconProps & {
  label: string;
  fill: string;
  color?: string;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 26 26" className="size-6.5" {...props}>
      <rect width="26" height="26" rx="6" fill={fill} />
      <text
        x="13"
        y="13.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize={size}
        fontWeight="700"
        fill={color}
      >
        {label}
      </text>
    </svg>
  );
}
