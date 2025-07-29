import process from "process";
import os from "os";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { baseURL } from "../../config/env.js";
import { DomainEvent } from "../../types/events/domain-event.js";
import { AuthInfo } from "../../client-utils/auth-manager.js";

type TelemetryPayload = {
  payload: DomainEvent;
  timestamp: string;
  cliVersion: string;
  platform: string;
  releaseVersion: string;
  nodeVersion: string;
  userAgent: string;
};

export class TelemetryService {
  private readonly url: string = `${baseURL}/api/telemetry/track`;
  private readonly configDirectory: string;
  private static cachedCliVersion: string | null = null; 

  constructor(configDirectory: string) {
    this.configDirectory = configDirectory;
  }

  public async trackEvent<T extends DomainEvent>(event: T): Promise<void> {
    const authInfo = await this.getAuthInfo(this.configDirectory);
    const telemetryOptedOut = process.env.APIMATIC_CLI_TELEMETRY_OPTOUT === "1";

    if (telemetryOptedOut || authInfo?.APIMATIC_CLI_TELEMETRY_OPTOUT === "1") {
      return;
    }

    const payload: TelemetryPayload = {
      payload: event,
      timestamp: new Date().toISOString(),
      cliVersion: this.getCLIVersion(),
      platform: os.platform(),
      releaseVersion: os.release(),
      nodeVersion: process.version,
      userAgent: this.getUserAgent()
    };

    // TODO: Replace with method of API Service.
    try {
      await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `X-Auth-Key ${authInfo?.authKey || ""}`,
        },
        body: JSON.stringify(payload)
      });
    } catch {
      // Ignore, fail silently.
    }
  }

  private getCLIVersion(): string {
    if (TelemetryService.cachedCliVersion) {
      return TelemetryService.cachedCliVersion;
    }

    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const pkgPath = join(__dirname, "../../../package.json");
      const pkgJson = fs.readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(pkgJson);
      const version = pkg.version || "unknown";
      TelemetryService.cachedCliVersion = version;
      return version;
    } catch {
      return "unknown";
    }
  }

  private async getAuthInfo(configDirectory: string): Promise<AuthInfo | null> {
    try {
      const data: AuthInfo | null = JSON.parse(await fs.readFile(join(configDirectory, "config.json"), "utf8"));
      return data;
    } catch {
      return null;
    }
  }

  private getUserAgent(): string {
    const osInfo = `${os.platform()} ${os.release()}`;
    const engine = "Node.js";
    const engineVersion = process.version;

    return `APIMATIC CLI - [OS: ${osInfo}, Engine: ${engine}/${engineVersion}]`;
  }
}
