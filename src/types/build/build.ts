import { DirectoryPath } from "../file/directoryPath.js";

export interface BuildConfig {
  generatePortal?: PortalConfig;
  apiCopilotConfig?: CopilotConfig;
  [key: string]: unknown;
}

export interface PortalConfig {
  contentFolder?: string;
  apiSpecPath?: DirectoryPath;
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
