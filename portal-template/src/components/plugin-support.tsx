import type { ReactNode } from 'react';
import { asMarkdown } from 'fumadocs-core/server';
import { LanguageLogo, PLATFORMS } from './logos';

const CHIP = 'flex items-center gap-2 rounded-full border bg-fd-card px-3 py-1.5 text-sm text-fd-card-foreground';

export function PluginLanguages({ children }: Readonly<{ children?: ReactNode }>) {
  if (asMarkdown()) {
    return children;
  }
  return <ul className="not-prose my-4 flex flex-wrap gap-2">{children}</ul>;
}

export function PluginLanguage({ language, name }: Readonly<{ language: string; name: string }>) {
  if (asMarkdown()) {
    return `- ${name}`;
  }
  return (
    <li className={CHIP}>
      <LanguageLogo language={language} className="size-4" />
      {name}
    </li>
  );
}

export function PluginPlatforms() {
  if (asMarkdown()) {
    return PLATFORMS.map(({ name }) => `- ${name}`).join('\n');
  }
  return (
    <ul className="not-prose my-4 flex flex-wrap gap-2">
      {PLATFORMS.map(({ name, Logo }) => (
        <li key={name} className={CHIP}>
          <Logo className="size-4" />
          {name}
        </li>
      ))}
    </ul>
  );
}
