import type { ReactNode, SVGProps } from "react";

/** Props every bundled mark accepts, so callers can restyle or resize one. */
export type IconProps = SVGProps<SVGSVGElement>;

/** A lookup of string keys to marks, as consumed by `iconResolver`. */
export type IconMap = Record<string, (props: IconProps) => ReactNode>;
