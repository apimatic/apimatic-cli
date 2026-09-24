import type { ContextPluginIde } from "../types";

/** Absolute URLs open in a new tab unless the item says otherwise. */
export function isExternal(ide: ContextPluginIde): boolean {
  return ide.external ?? /^[a-z][a-z0-9+.-]*:/i.test(ide.href ?? "");
}
