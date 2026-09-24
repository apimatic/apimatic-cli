import { FileName } from '../file/fileName.js';
import { Language, LANGUAGE_NAMES } from '../sdk/generate.js';
import { PortalLanguages } from './portal-languages.js';

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
  data: Readonly<Record<string, string>>;
}

/** A section's `nav.json`, which names its tab and orders its pages. */
export interface GeneratedNavigation {
  section: GeneratedSection;
  contents: string;
}

/**
 * The pages `apimatic.json` calls for: the SDKs page and one page per language, in the order
 * the `languages` block lists them, and the context plugin page when there is a `plugin` block.
 */
export class GeneratedPages {
  private constructor(private readonly languages: readonly Language[], private readonly plugin: boolean) {}

  public static of(languages: PortalLanguages, plugin: boolean): GeneratedPages {
    return new GeneratedPages(languages.all(), plugin);
  }

  public sections(): GeneratedSection[] {
    return this.plugin ? [SDK_SECTION, PLUGIN_SECTION] : [SDK_SECTION];
  }

  public pages(): GeneratedPage[] {
    const languagePages = this.languages.map(
      (language): GeneratedPage => ({
        section: SDK_SECTION,
        fileName: new FileName(`${language}.mdx`),
        template: 'sdk',
        data: { language, name: LANGUAGE_NAMES[language] }
      })
    );
    const pluginPages: GeneratedPage[] = this.plugin
      ? [{ section: PLUGIN_SECTION, fileName: INDEX_PAGE, template: 'context-plugin', data: {} }]
      : [];
    return [
      { section: SDK_SECTION, fileName: INDEX_PAGE, template: 'sdks', data: {} },
      ...languagePages,
      ...pluginPages
    ];
  }

  // The index page is the folder's own link rather than one of its pages, so no file names it.
  public navigationFiles(): GeneratedNavigation[] {
    return this.sections().map((section) => ({
      section,
      contents: `${JSON.stringify(
        section === SDK_SECTION ? { title: section.title, pages: this.languages } : { title: section.title },
        null,
        2
      )}\n`
    }));
  }
}
