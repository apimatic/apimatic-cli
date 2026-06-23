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
  portalSettings?: PortalSettings;
  apiSpecPath?: DirectoryPath;
  [key: string]: unknown;
}

export interface PortalSettings {
  /** Base URL for the API calls made by the portal. Preferred over `generatePortal.baseUrl` for portal artifacts. */
  baseUrl?: string;
  /** Language/template id the portal opens on first load. */
  initialPlatform?: string;
  /** Per-language portal settings, keyed by language/template id. */
  languageSettings?: { [language: string]: LanguageSetting };
  [key: string]: unknown;
}

export interface LanguageSetting {
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

// Rich wrapper around the parsed APIMATIC-BUILD.json. All build-config reads and
// mutations go through here so callers express intent rather than poking at the
// raw JSON shape. Construct via `BuildConfig.parse`; persist via `BuildContext`.
export class BuildConfig {
  constructor(private readonly data: BuildConfigData) {}

  public static parse(json: string): BuildConfig {
    return new BuildConfig(JSON.parse(json) as BuildConfigData);
  }

  // Used implicitly by JSON.stringify when the config is written back to disk.
  public toJSON(): BuildConfigData {
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

  /** Sets the portal's languageConfig from the selected friendly language ids. */
  public setPortalLanguages(languages: string[]): void {
    this.portal().languageConfig = getLanguagesConfig(languages);
  }

  /** Sets (or overwrites) the API Copilot configuration. */
  public setApiCopilotConfig(config: CopilotConfig): void {
    this.data.apiCopilotConfig = config;
  }

  // Enables API Copilot for a locally-served portal: stores the Copilot config, points
  // the portal base URL at the local serve URL, and turns on AI editor integrations.
  public enableApiCopilotForPortal(key: string, welcomeMessage: string, baseUrl: string): void {
    this.data.apiCopilotConfig = { isEnabled: true, key, welcomeMessage };
    this.portal().baseUrl = baseUrl;
    this.enableAiIntegrations();
  }

  // Aligns a localhost base URL's port with the actual serve port. Returns the
  // before/after URLs when a change was made, or undefined when nothing changed
  // (no base URL, non-localhost URL, or the port already matches).
  public reconcileLocalhostBaseUrlPort(servePort: number): { previous: string; updated: string } | undefined {
    // `portalSettings.baseUrl` is preferred for portal artifacts; otherwise fall back
    // to `generatePortal.baseUrl`. Mirrors how codegen resolves the base URL.
    const portalSettings = this.data.generatePortal?.portalSettings;
    const baseUrl = portalSettings?.baseUrl ?? this.data.generatePortal?.baseUrl;
    if (!baseUrl) {
      return undefined;
    }

    const parsedUrl = UrlPath.create(baseUrl);
    if (!parsedUrl?.isLocalhost() || parsedUrl.port() === servePort) {
      return undefined;
    }

    const updated = parsedUrl.withPort(servePort).toString();
    if (portalSettings?.baseUrl) {
      portalSettings.baseUrl = updated;
    } else {
      this.portal().baseUrl = updated;
    }
    return { previous: baseUrl, updated };
  }

  // Adds (or replaces, by permalink) a recipe workflow entry.
  public addRecipeWorkflow(name: string, functionName: string, scriptPath: string): void {
    const recipes = (this.data.recipes ??= {});
    const workflows = (recipes.workflows ??= []);
    const permalink = `page:recipes/${functionName}`;
    const workflow: RecipeWorkflow = { name, permalink, functionName, scriptPath };
    const existingIndex = workflows.findIndex((w) => w.permalink === permalink);
    if (existingIndex !== -1) {
      workflows[existingIndex] = workflow;
    } else {
      workflows.push(workflow);
    }
  }

  // Enables Cursor/Claude Code/VS Code integrations for the selected SDK languages.
  // Supplying languageSettings suppresses codegen's own per-language auto-population,
  // so the http entry (no AI integration) the portal needs to render is added too:
  // initialPlatform defaults to http, and a missing entry leaves the widget unrendered.
  private enableAiIntegrations(): void {
    const portalSettings = (this.portal().portalSettings ??= {});
    const languageSettings = (portalSettings.languageSettings ??= {});

    languageSettings[HTTP_TEMPLATE_ID] ??= {};

    let firstSdkTemplateId: string | undefined;
    for (const language of Object.keys(this.portal().languageConfig)) {
      const templateId = CODEGEN_TEMPLATE_ID_BY_LANGUAGE[language];
      if (!templateId) {
        continue;
      }
      firstSdkTemplateId ??= templateId;
      languageSettings[templateId] = {
        ...languageSettings[templateId],
        aiIntegration: {
          cursor: { isEnabled: true },
          claudeCode: { isEnabled: true },
          vscode: { isEnabled: true }
        }
      };
    }

    // Open the portal on the first SDK language (the entry after http) rather than http.
    if (firstSdkTemplateId) {
      portalSettings.initialPlatform = firstSdkTemplateId;
    }
  }

  // Portal-config accessor for mutations. Assumes a single (non-versioned) portal build.
  private portal(): PortalConfig {
    return this.data.generatePortal!;
  }
}
