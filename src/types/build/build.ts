export interface BuildConfig {
  generatePortal?: PortalConfig;
  apiCopilotConfig?: CopilotConfig;
  [key: string]: unknown;
}

export interface PortalConfig {
  contentFolder?: string;
  languageConfig: { [key: string]: object };
  [key: string]: unknown;
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
