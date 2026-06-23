import { DirectoryPath } from "../file/directoryPath.js";
import { UrlPath } from "../file/urlPath.js";

export interface BuildConfigData {
  generatePortal?: PortalConfig;
  generateVersionedPortal?: object;
  versionsPath?: string;
  apiCopilotConfig?: CopilotConfig;
  recipes?: RecipesConfig;
  [key: string]: unknown;
}

export interface PortalConfig {
  contentFolder?: string;
  languageConfig: { [key: string]: object };
  /** URL where the portal will be hosted. Mirrors `generatePortal.baseUrl` in codegen. */
  baseUrl?: string;
  /** Portal UI settings. Mirrors `generatePortal.portalSettings` in codegen. */
  portalSettings?: PortalSettingsData;
  apiSpecPath?: DirectoryPath;
  [key: string]: unknown;
}

export interface PortalSettingsData {
  /** Base URL for the API calls made by the portal. Preferred over `generatePortal.baseUrl` for portal artifacts. */
  baseUrl?: string;
  /** Language/template id the portal opens on first load. */
  initialPlatform?: string;
  /** Per-language portal settings, keyed by language/template id. */
  languageSettings?: { [language: string]: LanguageSettingData };
  [key: string]: unknown;
}

export interface LanguageSettingData {
  aiIntegration?: AiIntegration;
  [key: string]: unknown;
}

export interface AiIntegration {
  cursor?: AiIntegrationSetting;
  claudeCode?: AiIntegrationSetting;
  vscode?: AiIntegrationSetting;
}

export interface AiIntegrationSetting {
  isEnabled: boolean;
  stabilityLevelTag?: string;
}

export interface CopilotConfig {
  isEnabled: boolean;
  key: string;
  welcomeMessage: string;
}

export interface RecipesConfig {
  workflows?: RecipeWorkflow[];
}

export interface RecipeWorkflow {
  name: string;
  permalink: string;
  functionName: string;
  scriptPath: string;
}

export function getLanguagesConfig(selectedLanguages: string[]) {
  return selectedLanguages.reduce((config, lang) => {
    config[lang] = {};
    return config;
  }, {} as { [key: string]: object });
}

// Maps the CLI's friendly language identifiers (used as languageConfig keys) to
// codegen's SupportedTemplates ids, which is what portalSettings.languageSettings
// must be keyed by (codegen resolves these via SdkLanguage.FromSupportedTemplate).
// These ids are version-specific in codegen (e.g. php_generic_lib_v2) — keep in sync
// with APIMatic.CodeGen.Common.SdkLanguage.
const CODEGEN_TEMPLATE_ID_BY_LANGUAGE: Readonly<Record<string, string>> = {
  typescript: "ts_generic_lib",
  csharp: "cs_net_standard_lib",
  java: "java_eclipse_jre_lib",
  php: "php_generic_lib_v2",
  python: "python_generic_lib",
  ruby: "ruby_generic_lib",
  go: "go_generic_lib"
};
// codegen derives initialPlatform from languageConfig (http is always first), so a
// languageSettings entry for http must exist or the portal widget fails to render.
const HTTP_TEMPLATE_ID = "http_curl_v1" as const;

// Immutable per-language portal setting. Build new values via the static factory and
// the with* transforms; the wrapped data is never mutated after construction.
export class LanguageSetting {
  private constructor(private readonly data: LanguageSettingData) {}

  public static from(data: LanguageSettingData = {}): LanguageSetting {
    return new LanguageSetting(data);
  }

  /** Returns a copy with all AI editor integrations (Cursor/Claude Code/VS Code) enabled. */
  public withAiIntegrationsEnabled(): LanguageSetting {
    return new LanguageSetting({
      ...this.data,
      aiIntegration: {
        cursor: { isEnabled: true },
        claudeCode: { isEnabled: true },
        vscode: { isEnabled: true }
      }
    });
  }

  public toLanguageSettingData(): LanguageSettingData {
    return this.data;
  }
}

// Immutable portal UI settings. Build new values via the static factory and the with*
// transforms; the wrapped data is never mutated after construction.
export class PortalSettings {
  private constructor(private readonly data: PortalSettingsData) {}

  public static from(data: PortalSettingsData = {}): PortalSettings {
    return new PortalSettings(data);
  }

  /** Returns a copy with the API-call base URL set. */
  public withBaseUrl(baseUrl: UrlPath): PortalSettings {
    return new PortalSettings({ ...this.data, baseUrl: baseUrl.toString() });
  }

  // Returns a copy with AI editor integrations enabled for the given SDK languages
  // (friendly ids). Always adds the http entry the portal needs to render and opens the
  // portal on the first SDK language. Languages without a codegen template id are skipped.
  public withAiIntegrations(languages: string[]): PortalSettings {
    const languageSettings: { [language: string]: LanguageSettingData } = { ...this.data.languageSettings };
    languageSettings[HTTP_TEMPLATE_ID] = languageSettings[HTTP_TEMPLATE_ID] ?? {};

    let firstSdkTemplateId: string | undefined;
    for (const language of languages) {
      const templateId = CODEGEN_TEMPLATE_ID_BY_LANGUAGE[language];
      if (!templateId) {
        continue;
      }
      firstSdkTemplateId ??= templateId;
      languageSettings[templateId] = LanguageSetting.from(languageSettings[templateId]).withAiIntegrationsEnabled().toLanguageSettingData();
    }

    return new PortalSettings({
      ...this.data,
      languageSettings,
      ...(firstSdkTemplateId ? { initialPlatform: firstSdkTemplateId } : {})
    });
  }

  public toPortalSettingsData(): PortalSettingsData {
    return this.data;
  }
}

// Immutable wrapper around the parsed APIMATIC-BUILD.json. All build-config reads go
// through accessor methods and all changes go through with*/update methods that
// return a NEW BuildConfig — the wrapped data is never mutated after construction.
// Construct via `BuildConfig.parse`; persist via `BuildContext`.
export class BuildConfig {
  private constructor(private readonly data: BuildConfigData) {}

  public static parse(json: string): BuildConfig {
    return new BuildConfig(JSON.parse(json) as BuildConfigData);
  }

  // Used implicitly by JSON.stringify when the config is written back to disk.
  public toBuildConfigDData(): BuildConfigData {
    return this.data;
  }

  /** Content directory for the portal, relative to the build directory. Defaults to "content". */
  public contentFolder(): string {
    return this.data.generatePortal?.contentFolder ?? "content";
  }

  /** True when this build produces a multi-versioned portal. */
  public isVersioned(): boolean {
    return this.data.generateVersionedPortal != null;
  }

  /** Directory holding the versioned portals, relative to the build directory. Defaults to "versioned_docs". */
  public versionsPath(): string {
    return this.data.versionsPath ?? "versioned_docs";
  }

  /** True when API Copilot is already configured for this build. */
  public hasApiCopilot(): boolean {
    return this.data.apiCopilotConfig != null;
  }

  /** Returns a copy with the portal's languageConfig set from the selected friendly language ids. */
  public withPortalLanguages(languages: string[]): BuildConfig {
    const portal = this.data.generatePortal!;
    return new BuildConfig({
      ...this.data,
      generatePortal: { ...portal, languageConfig: getLanguagesConfig(languages) }
    });
  }

  /** Returns a copy with the API Copilot configuration set (or overwritten). */
  public withApiCopilotConfig(config: CopilotConfig): BuildConfig {
    return new BuildConfig({ ...this.data, apiCopilotConfig: { ...config } });
  }

  // Returns a copy with API Copilot enabled for a locally-served portal: stores the
  // Copilot config, points the portal base URL at the local serve URL, and turns on AI
  // editor integrations for the configured SDK languages.
  public withApiCopilotForPortal(key: string, welcomeMessage: string, baseUrl: string): BuildConfig {
    const portal = this.data.generatePortal!;
    return new BuildConfig({
      ...this.data,
      apiCopilotConfig: { isEnabled: true, key, welcomeMessage },
      generatePortal: {
        ...portal,
        baseUrl,
        portalSettings: PortalSettings.from(portal.portalSettings)
          .withAiIntegrations(Object.keys(portal.languageConfig))
          .toPortalSettingsData()
      }
    });
  }

  // Returns a copy with the portal base URL repointed at the serve URL, or `this`
  // unchanged when there's no localhost base URL to rewrite (or it already matches the
  // serve URL). Callers detect a change via reference identity: `result !== original`.
  public updateBuildConfigBaseUrl(serveUrl: UrlPath): BuildConfig {
    // `portalSettings.baseUrl` is preferred for portal artifacts; otherwise fall back
    // to `generatePortal.baseUrl`. Mirrors how codegen resolves the base URL.
    const portalSettings = this.data.generatePortal?.portalSettings;
    const baseUrl = portalSettings?.baseUrl ?? this.data.generatePortal?.baseUrl;
    if (!baseUrl) {
      return this;
    }

    const parsedUrl = UrlPath.create(baseUrl);
    if (!parsedUrl?.isLocalhost() || parsedUrl.isEqual(serveUrl)) {
      return this;
    }

    const portal = this.data.generatePortal!;
    const updatedPortal: PortalConfig = portal.portalSettings?.baseUrl
      ? { ...portal, portalSettings: PortalSettings.from(portal.portalSettings).withBaseUrl(serveUrl).toPortalSettingsData() }
      : { ...portal, baseUrl: serveUrl.toString() };
    return new BuildConfig({ ...this.data, generatePortal: updatedPortal });
  }

  // Returns a copy with a recipe workflow added (or replaced, matched by permalink).
  public withRecipeWorkflow(name: string, functionName: string, scriptPath: string): BuildConfig {
    const recipes = this.data.recipes ?? {};
    const workflows = recipes.workflows ?? [];
    const permalink = `page:recipes/${functionName}`;
    const workflow: RecipeWorkflow = { name, permalink, functionName, scriptPath };
    const existingIndex = workflows.findIndex((w) => w.permalink === permalink);
    const updatedWorkflows =
      existingIndex === -1 ? [...workflows, workflow] : workflows.map((w, index) => (index === existingIndex ? workflow : w));
    return new BuildConfig({ ...this.data, recipes: { ...recipes, workflows: updatedWorkflows } });
  }
}
