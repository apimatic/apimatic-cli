import { DirectoryPath } from "../file/directoryPath.js";

export interface BuildConfig {
  generatePortal?: PortalConfig;
  generateVersionedPortal?: object;
  versionsPath?: string;
  apiCopilotConfig?: CopilotConfig;
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

export function getLanguagesConfig(selectedLanguages: string[]) {
  return selectedLanguages.reduce((config, lang) => {
    config[lang] = {};
    return config;
  }, {} as { [key: string]: object });
}
