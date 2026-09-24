import type { Sdk } from './types';

/**
 * Rendered by `<SdkGrid />` when no `sdks` prop is given. Treat it as the
 * fallback, not the source of truth — the page owns its own list so edits in
 * MDX show up without touching TypeScript.
 */
export const defaultSdks: Sdk[] = [
  {
    id: 'typescript',
    name: 'TypeScript',
    icon: 'typescript',
    description: 'Fully typed SDK for Node.js and the browser.',
    install: 'npm install @apimatic/sdk',
    actions: [
      { label: 'Download SDK', href: '#download-typescript', variant: 'primary', icon: 'download' },
      { label: 'Configure', href: '/docs/sdks/typescript' },
    ],
    links: [
      { label: 'npm', href: 'https://www.npmjs.com/package/@apimatic/sdk' },
      { label: 'Source', href: 'https://github.com/apimatic/sdk-typescript' },
    ],
  },
  {
    id: 'python',
    name: 'Python',
    icon: 'python',
    description: 'Pythonic client with async support built in.',
    install: 'pip install apimatic',
    actions: [
      { label: 'Download SDK', href: '#download-python', variant: 'primary', icon: 'download' },
      { label: 'Configure', href: '/docs/sdks/python' },
    ],
    links: [
      { label: 'PyPI', href: 'https://pypi.org/project/apimatic' },
      { label: 'Source', href: 'https://github.com/apimatic/sdk-python' },
    ],
  },
  {
    id: 'java',
    name: 'Java',
    icon: 'java',
    description: 'Type-safe client for JVM-based services.',
    install: 'implementation("io.apimatic:sdk:2.4.0")',
    actions: [
      { label: 'Download SDK', href: '#download-java', variant: 'primary', icon: 'download' },
      { label: 'Configure', href: '/docs/sdks/java' },
    ],
    links: [
      { label: 'Maven Central', href: 'https://central.sonatype.com/artifact/io.apimatic/sdk' },
      { label: 'Source', href: 'https://github.com/apimatic/sdk-java' },
    ],
  },
  {
    id: 'dotnet',
    name: '.NET',
    icon: 'dotnet',
    description: 'First-class support for C# and ASP.NET apps.',
    install: 'dotnet add package APIMatic.SDK',
    actions: [
      { label: 'Download SDK', href: '#download-dotnet', variant: 'primary', icon: 'download' },
      { label: 'Configure', href: '/docs/sdks/dotnet' },
    ],
    links: [
      { label: 'NuGet', href: 'https://www.nuget.org/packages/APIMatic.SDK' },
      { label: 'Source', href: 'https://github.com/apimatic/sdk-dotnet' },
    ],
  },
  {
    id: 'php',
    name: 'PHP',
    icon: 'php',
    description: 'Composer package for modern PHP applications.',
    install: 'composer require apimatic/sdk',
    actions: [
      { label: 'Download SDK', href: '#download-php', variant: 'primary', icon: 'download' },
      { label: 'Configure', href: '/docs/sdks/php' },
    ],
    links: [
      { label: 'Packagist', href: 'https://packagist.org/packages/apimatic/sdk' },
      { label: 'Source', href: 'https://github.com/apimatic/sdk-php' },
    ],
  },
  {
    id: 'ruby',
    name: 'Ruby',
    icon: 'ruby',
    description: 'Idiomatic gem for Rails and plain Ruby apps.',
    install: 'gem install apimatic',
    actions: [
      { label: 'Download SDK', href: '#download-ruby', variant: 'primary', icon: 'download' },
      { label: 'Configure', href: '/docs/sdks/ruby' },
    ],
    links: [
      { label: 'RubyGems', href: 'https://rubygems.org/gems/apimatic' },
      { label: 'Source', href: 'https://github.com/apimatic/sdk-ruby' },
    ],
  },
];
