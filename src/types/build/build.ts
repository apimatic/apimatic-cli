export interface BuildConfig {
  apiCopilotConfig?: CopilotConfig;
  [key: string]: unknown;
}


export interface CopilotConfig {
  isEnabled: boolean;
  key: string;
  welcomeMessage: string;
}


export function updateCopilotConfig(
  buildConfig: BuildConfig,
  copilotConfig: CopilotConfig
): BuildConfig {
  return {
    ...buildConfig,
    apiCopilotConfig: {
      ...copilotConfig,
    },
  };
}
