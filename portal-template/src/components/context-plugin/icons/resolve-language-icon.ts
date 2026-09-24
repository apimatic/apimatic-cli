import { iconResolver } from "./icon-resolver";
import { languageIcons } from "./language-icons";

/** Resolves the mark shown in the available-languages row. */
export const resolveLanguageIcon = iconResolver(languageIcons);
