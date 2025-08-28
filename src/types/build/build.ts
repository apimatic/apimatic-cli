import { FilePath } from "../file/filePath.js";

export interface BuildConfig {
  generatePortal?: PortalConfig;
  apiCopilotConfig?: CopilotConfig;  
  [key: string]: unknown;
}

export interface PortalConfig {
  contentFolder?: string;
  apiSpecPath?: FilePath;
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
