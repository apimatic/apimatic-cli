import { UrlPath } from '../file/urlPath.js';
import { PackageConfigurationForLanguage } from '../publish/package-settings-configuration.js';
import { Language } from '../sdk/generate.js';

/** A released SDK package, as its public registry lists it. */
export interface PublishedPackage {
  name: string;
  registry: string;
  url: UrlPath;
}

interface PackageRegistry<L extends Language> {
  name: string;
  /** The `packageConfiguration` field that holds the package's name, as the profile types it. */
  nameField: keyof PackageConfigurationForLanguage[L] & string;
  address: (packageName: string) => string;
}

// The public registry of each language the portal supports; a private one is not told apart.
const REGISTRIES: { [L in Language]?: PackageRegistry<L> } = {
  [Language.TYPESCRIPT]: {
    name: 'npm',
    nameField: 'name',
    // `encodeURI` keeps a scoped name's `@` and `/`, which npm addresses as they are.
    address: (packageName) => `https://www.npmjs.com/package/${encodeURI(packageName)}`
  },
  [Language.PYTHON]: {
    name: 'PyPI',
    nameField: 'name',
    address: (packageName) => `https://pypi.org/project/${encodeURIComponent(packageName)}/`
  },
  [Language.CSHARP]: {
    name: 'NuGet',
    nameField: 'packageId',
    address: (packageName) => `https://www.nuget.org/packages/${encodeURIComponent(packageName)}`
  }
};

/** Null when the configuration does not name the package, which the backend's validation reports. */
export function publishedPackage(
  language: Language,
  configuration: Readonly<Record<string, unknown>>
): PublishedPackage | null {
  const registry = REGISTRIES[language];
  const field = registry === undefined ? undefined : configuration[registry.nameField];
  const name = typeof field === 'string' ? field.trim() : '';
  if (registry === undefined || name.length === 0) {
    return null;
  }
  return { name, registry: registry.name, url: new UrlPath(registry.address(name)) };
}
