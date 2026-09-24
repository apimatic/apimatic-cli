import { cn } from "@/lib/cn";
import { resolveLanguageIcon } from "./icons/resolve-language-icon";
import type { ContextPluginLanguage } from "./types";

export function LanguageMark({
  language,
  comingSoonLabel,
}: {
  language: ContextPluginLanguage;
  comingSoonLabel: string;
}) {
  const hoverLabel =
    language.tooltip ??
    (language.comingSoon
      ? `${language.label} - ${comingSoonLabel}`
      : language.label);

  return (
    <span className="group relative inline-flex h-6.5 items-center justify-center">
      <span
        className={cn(
          "inline-flex items-center justify-center transition duration-150",
          // `fill-current` must reach the paths: a `fill=` attribute is not inherited.
          language.comingSoon && "text-fd-muted-foreground [&_*]:fill-current",
        )}
      >
        {resolveLanguageIcon(language.icon)}
      </span>

      {/* The mark is `aria-hidden`, so this carries the accessible name. */}
      <span className="sr-only">{hoverLabel}</span>

      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-md border bg-fd-popover px-2 py-1 text-xs whitespace-nowrap text-fd-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100"
      >
        {hoverLabel}
      </span>
    </span>
  );
}
