import type { ReactNode } from 'react';
import { asMarkdown } from 'fumadocs-core/server';
import { LanguageLogo, LogoTile, PLATFORMS } from './logos';

const CARD = 'flex items-center gap-3 rounded-xl border bg-fd-card p-3 font-medium text-fd-card-foreground';

// By the width the page gives the list, not the screen's, up to three to a row.
function CardGrid({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="not-prose @container my-4">
      <ul className="grid grid-cols-1 gap-3 @md:grid-cols-2 @2xl:grid-cols-3">{children}</ul>
    </div>
  );
}

export function PluginLanguages({ children }: Readonly<{ children?: ReactNode }>) {
  if (asMarkdown()) {
    return children;
  }
  return <CardGrid>{children}</CardGrid>;
}

export function PluginLanguage({ language, name }: Readonly<{ language: string; name: string }>) {
  if (asMarkdown()) {
    return `- ${name}`;
  }
  return (
    <li className={CARD}>
      <LogoTile>
        <LanguageLogo language={language} className="size-5" />
      </LogoTile>
      {name}
    </li>
  );
}

export function PluginPlatforms() {
  if (asMarkdown()) {
    return PLATFORMS.map(({ name }) => `- ${name}`).join('\n');
  }
  return (
    <CardGrid>
      {PLATFORMS.map(({ name, Logo }) => (
        <li key={name} className={CARD}>
          <LogoTile>
            <Logo className="size-5" />
          </LogoTile>
          {name}
        </li>
      ))}
    </CardGrid>
  );
}
