import { cn } from "@/lib/cn";
import { ContextPluginCommandBlock } from "./command-block";
import { defaultIdes } from "./data/default-ides";
import { defaultLanguages } from "./data/default-languages";
import { IdeChip } from "./ide-chip";
import { LanguageMark } from "./language-mark";
import { Section } from "./section";
import type { ContextPluginInstallProps } from "./types";

export function ContextPluginInstall({
  title = "Install context plugin for API",
  command = "npx context-plugin",
  commandTitle,
  note = "Installs into every assistant it detects. Node.js 18+.",
  idesLabel = "SUPPORTED IDES",
  ides,
  languagesLabel = "AVAILABLE LANGUAGES",
  languages,
  comingSoonLabel = "coming soon",
  showNote = true,
  showIdes = true,
  showLanguages = true,
  className,
}: ContextPluginInstallProps) {
  const visibleIdes = showIdes ? (ides ?? defaultIdes) : [];
  const visibleLanguages = showLanguages ? (languages ?? defaultLanguages) : [];

  return (
    <div
      className={cn("not-prose overflow-hidden rounded-2xl border", className)}
    >
      <div className="p-7">
        {title ? (
          <p className="mb-2.5 flex items-center gap-2 text-base font-semibold text-fd-foreground">
            {title}
          </p>
        ) : null}

        <ContextPluginCommandBlock command={command} title={commandTitle} />

        {showNote && note ? (
          <p className="mt-5 mb-0 text-sm text-fd-muted-foreground">{note}</p>
        ) : null}

        {visibleIdes.length > 0 ? (
          <Section label={idesLabel} gap="gap-2.5">
            {visibleIdes.map((ide, index) => (
              <IdeChip key={ide.id ?? index} ide={ide} />
            ))}
          </Section>
        ) : null}

        {visibleLanguages.length > 0 ? (
          <Section label={languagesLabel} gap="gap-4">
            {visibleLanguages.map((language, index) => (
              <LanguageMark
                key={language.id ?? index}
                language={language}
                comingSoonLabel={comingSoonLabel}
              />
            ))}
          </Section>
        ) : null}
      </div>
    </div>
  );
}
