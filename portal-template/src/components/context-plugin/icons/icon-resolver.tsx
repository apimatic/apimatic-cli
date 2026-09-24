import type { ReactNode } from "react";
import type { IconMap } from "./types";

/** A known name becomes its mark; anything else is returned untouched. */
export function iconResolver<T extends IconMap>(icons: T) {
  return function resolve(icon: ReactNode): ReactNode {
    if (icon === undefined || icon === null) return null;
    if (typeof icon !== "string" || !(icon in icons)) return icon;

    const Icon = icons[icon];
    return <Icon aria-hidden />;
  };
}
