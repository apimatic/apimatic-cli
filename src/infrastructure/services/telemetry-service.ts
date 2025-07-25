import process from "process";
import console from "console";
import os from "os";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { baseURL } from "../../config/env.js";
import { DomainEvent } from "../../types/common/tracking-event.js";
import { AuthInfo } from "../../client-utils/auth-manager.js";

type TelemetryPayload = {
  event: DomainEvent;
  userDetails: {
    email: string;
  };
  timestamp: string;
  cliVersion: string;
  platform: string;
  releaseVersion: string;
  nodeVersion: string;
  userAgent: string;
};

export class TelemetryService {
  private readonly url: string = `${baseURL}/account/logEvent`;
  private readonly configDirectory: string;
  constructor(configDirectory: string) {
    this.configDirectory = configDirectory;
  }

  public async trackEvent<T extends DomainEvent>(event: T): Promise<void> {
    const authInfo = await this.getAuthInfo(this.configDirectory);

    if (this.TELEMETRY_DISABLED || authInfo?.APIMATIC_CLI_TELEMETRY_OPTOUT === "1") {
      return;
    }

    const userDetails = {
      email: authInfo?.email ?? "unknown"
    };

    //TODO: This needs to send userId, otherwise tracking will not work.
    const payload: TelemetryPayload = {
      event,
      userDetails,
      timestamp: new Date().toISOString(),
      cliVersion: await this.getCLIVersion(),
      platform: os.platform(),
      releaseVersion: os.release(),
      nodeVersion: process.version,
      userAgent: this.getUserAgent()
    };

    //TODO: Implement the actual HTTP request to send the payload to the API.
    console.log(`[telemetry] ${JSON.stringify(payload)}`);
  }

  //TODO; move to const
  private get TELEMETRY_DISABLED(): boolean {
    return process.env.APIMATIC_CLI_TELEMETRY_OPTOUT === "1";
  }

  //TODO: add caching of version, don't read every time.
  private async getCLIVersion(): Promise<string> {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const pkgPath = join(__dirname, "../../../package.json");
      const pkgJson = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(pkgJson);
      return pkg.version || "unknown";
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
