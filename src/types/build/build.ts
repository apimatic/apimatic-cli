
export type LLMProvider = "open_ai" | "gemini-pro";

export interface BuildConfig {
  apiCopilotConfig?: CopilotConfig;
  [key: string]: unknown;
}


export interface CopilotConfig {
  isEnabled: boolean;
  key: string;
  welcomeMessage: string;
  llm: LLMProvider;
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
