import { posix } from 'node:path';
import { FileName } from '../file/fileName.js';
import { UrlPath } from '../file/urlPath.js';
import { Language, LANGUAGE_NAMES } from '../sdk/generate.js';
import { sdkDocsPath } from './page-fragments.js';
import { PageRecord, PageValues } from './page-template.js';
import { PortalArtifacts } from './portal-artifacts.js';
import { PLUGIN_DOWNLOAD_ADDRESS, sdkDownloadAddress } from './portal-downloads.js';
import { PortalLanguages } from './portal-languages.js';
import { PortalSdk } from './portal-sdk.js';

// `src/lib/source.ts` names it as a relative literal, so the browser bundle never carries the project's location.
export const GENERATED_DIRECTORY_NAME = 'generated';

/** A set of pages the CLI writes into the portal, which the portal shows as a tab of its own. */
export interface GeneratedSection {
  /** The folder the pages are written to, and so the address they are served at. */
  folder: string;
  /** The root `nav.json` entry that positions the tab. */
  token: string;
  title: string;
  /** What a message says the address is kept for. */
  description: string;
}

export const SDK_SECTION: GeneratedSection = {
  folder: 'sdks',
  token: 'apimatic:sdks',
  title: 'SDKs',
  description: 'the SDK pages'
};

const SDK_PAGES_DIRECTORY = posix.join(GENERATED_DIRECTORY_NAME, SDK_SECTION.folder);

export const PLUGIN_SECTION: GeneratedSection = {
  folder: 'context-plugin',
  token: 'apimatic:plugin',
  title: 'Context Plugin',
  description: 'the context plugin page'
};

/** Every section, in the order the tabs take when the root `nav.json` names none of them. */
export const GENERATED_SECTIONS: readonly GeneratedSection[] = [SDK_SECTION, PLUGIN_SECTION];

/** The templates in the package's `portal-pages/` directory, by the name of their file. */
export const PAGE_TEMPLATES = ['sdks', 'sdk', 'context-plugin'] as const;

export type PageTemplateName = (typeof PAGE_TEMPLATES)[number];

const INDEX_PAGE = new FileName('index.mdx');

/** A page to render from one of the templates and write into a section's folder. */
export interface GeneratedPage {
  section: GeneratedSection;
  fileName: FileName;
  template: PageTemplateName;
  data: PageValues;
}

/** A hosted plugin is installed from `portal.pluginUrl`, and the portal artifacts carry none. */
export type PluginSource = { kind: 'bundled' } | { kind: 'hosted'; url: UrlPath };

/** What the pages link to or include that the portal artifacts did not deliver. */
export interface MissingArtifacts {
  sdks: Language[];
  sdkDocs: Language[];
  /** Whether the plugin the page installs from the portal is not among them. */
  plugin: boolean;
}

/** A section's `nav.json`, which names its tab and orders its pages. */
export interface GeneratedNavigation {
  section: GeneratedSection;
  contents: string;
}

/**
 * The pages `apimatic.json` calls for: the SDKs page and one page per language, in the order
 * the `languages` block lists them, and the context plugin page when there is a plugin to install.
 */
export class GeneratedPages {
  private constructor(private readonly sdks: readonly PortalSdk[], private readonly plugin: PluginSource | null) {}

  public static of(languages: PortalLanguages, plugin: PluginSource | null): GeneratedPages {
    return new GeneratedPages(languages.listed(), plugin);
  }

  public sections(): GeneratedSection[] {
    return this.plugin === null ? [SDK_SECTION] : [SDK_SECTION, PLUGIN_SECTION];
  }

  /** Whatever pages the tabs hold, which the languages decide. */
  public makesSameTabsAs(other: GeneratedPages): boolean {
    const theirs = other.sections();
    const mine = this.sections();
    return mine.length === theirs.length && mine.every((section, index) => section === theirs[index]);
  }

  public pages(): GeneratedPage[] {
    const languagePages = this.sdks.map(
      (sdk): GeneratedPage => ({
        section: SDK_SECTION,
        fileName: new FileName(`${sdk.language}.mdx`),
        template: 'sdk',
        data: { ...card(sdk), docs: posix.relative(SDK_PAGES_DIRECTORY, sdkDocsPath(sdk.language)) }
      })
    );
    return [
      { section: SDK_SECTION, fileName: INDEX_PAGE, template: 'sdks', data: { sdks: this.sdks.map(card) } },
      ...languagePages,
      ...(this.plugin === null ? [] : [this.pluginPage(this.plugin)])
    ];
  }

  // The index page is the folder's own link rather than one of its pages, so no file names it.
  public navigationFiles(): GeneratedNavigation[] {
    return this.sections().map((section) => ({
      section,
      contents: `${JSON.stringify(
        section === SDK_SECTION
          ? { title: section.title, pages: this.sdks.map((sdk) => sdk.language) }
          : { title: section.title },
        null,
        2
      )}\n`
    }));
  }

  /** Null when the artifacts back every page; a page backed by nothing fails the build or links nowhere. */
  public missingFrom(artifacts: PortalArtifacts): MissingArtifacts | null {
    const languages = this.sdks.map((sdk) => sdk.language);
    const sdks = languages.filter((language) => !artifacts.sdks.has(language));
    const sdkDocs = languages.filter((language) => !artifacts.sdkDocs.has(language));
    const plugin = this.plugin?.kind === 'bundled' && artifacts.plugin === undefined;
    return sdks.length > 0 || sdkDocs.length > 0 || plugin ? { sdks, sdkDocs, plugin } : null;
  }

  // Every language the portal supports can be carried by a plugin, so the page lists them all.
  private pluginPage(plugin: PluginSource): GeneratedPage {
    return {
      section: PLUGIN_SECTION,
      fileName: INDEX_PAGE,
      template: 'context-plugin',
      data: {
        installPath: plugin.kind === 'hosted' ? attribute(plugin.url) : PLUGIN_DOWNLOAD_ADDRESS,
        languages: this.sdks.map((sdk) => ({ language: sdk.language, name: LANGUAGE_NAMES[sdk.language] }))
      }
    };
  }
}

/** Every field is present, empty when nothing is recorded, so a template's attribute list is fixed. */
function card(sdk: PortalSdk): PageRecord {
  const release = sdk.release();
  const source = sdk.sourceRepository();
  return {
    language: sdk.language,
    name: LANGUAGE_NAMES[sdk.language],
    page: `/${SDK_SECTION.folder}/${sdk.language}`,
    download: sdkDownloadAddress(sdk.language),
    source: source === null ? '' : attribute(source),
    version: release === null ? '' : attribute(release.version),
    packageName: release === null ? '' : attribute(release.package.name),
    packageUrl: release === null ? '' : attribute(release.package.url),
    registry: release === null ? '' : release.package.registry
  };
}

// A double-quoted JSX attribute, whose entities MDX decodes: `&` first, so an `&amp;` in a value survives.
function attribute(value: string | UrlPath): string {
  return `${value}`.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
