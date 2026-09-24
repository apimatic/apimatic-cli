import { iconResolver } from "./icon-resolver";
import { ideIcons } from "./ide-icons";

/** Resolves the `icon` of a {@link import("../types").ContextPluginIde}. */
export const resolveIdeIcon = iconResolver(ideIcons);
