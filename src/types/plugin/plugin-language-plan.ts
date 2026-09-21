import { Language } from '../sdk/generate.js';

/**
 * How each language the user picked will reach the plugin. A published language is named by its
 * entry, so its skill points at a repository or a package and nothing is bundled; every other
 * picked language gets an empty entry, which is what asks codegen to generate that SDK and bundle
 * it inside the plugin.
 */
export class PluginLanguagePlan {
  private constructor(private readonly published: Language[], private readonly local: Language[]) {}

  public static create(selected: Language[], published: Language[]): PluginLanguagePlan {
    const isPublished = new Set(published);
    // `--language` can name the same language twice, and a plan holding it twice would write its
    // entry twice and report it twice.
    const picked = [...new Set(selected)];

    return new PluginLanguagePlan(
      picked.filter((language) => isPublished.has(language)),
      picked.filter((language) => !isPublished.has(language))
    );
  }

  /** The languages needing an empty entry, and the only ones codegen bundles an SDK for. */
  public localLanguages(): Language[] {
    return [...this.local];
  }

  public hasLocal(): boolean {
    return this.local.length > 0;
  }

  public hasPublished(): boolean {
    return this.published.length > 0;
  }

  public isEmpty(): boolean {
    return this.published.length === 0 && this.local.length === 0;
  }
}
