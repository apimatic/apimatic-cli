import { FileName } from '../file/fileName.js';
import { UrlPath } from '../file/urlPath.js';
import { LANGUAGE_NAMES } from '../sdk/generate.js';
import { PageRecord, PageValues } from './page-template.js';
import { PLUGIN_DOWNLOAD_ADDRESS, sdkDownloadAddress } from './portal-downloads.js';
import { PortalLanguages } from './portal-languages.js';
import { PortalSdk } from './portal-sdk.js';

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

/**
 * Where the context plugin page tells readers to install the plugin from: the copy the portal
 * artifacts bundle into the portal, or the address `portal.pluginUrl` gives, in which case the
 * artifacts carry no plugin.
 */
export type PluginSource = { kind: 'bundled' } | { kind: 'hosted'; url: UrlPath };

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

  public pages(): GeneratedPage[] {
    const languagePages = this.sdks.map(
      (sdk): GeneratedPage => ({
        section: SDK_SECTION,
        fileName: new FileName(`${sdk.language}.mdx`),
        template: 'sdk',
        data: card(sdk)
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

/**
 * What a card and a language page show about one SDK. Every field is present, empty when
 * nothing is recorded, so a template's attribute list is fixed and a component hides the empty.
 */
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

/** The templates write values into double-quoted JSX attributes, which a `"` would end. */
function attribute(value: string | UrlPath): string {
  return `${value}`.replaceAll('"', '&quot;');
}
