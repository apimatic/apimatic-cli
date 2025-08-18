import process from "process";
import os from "os";
import fs from "fs-extra";
import { DomainEvent } from "../../types/events/domain-event.js";
import { AuthInfo } from "../../client-utils/auth-manager.js";
import { envInfo } from "../env-info.js";
import path from "path";
import { ApiService } from "./api-service.js";

type TelemetryPayload = {
  payload: DomainEvent;
  timestamp: string;
  cliVersion: string;
  platform: string;
  releaseVersion: string;
  nodeVersion: string;
};

export class TelemetryService {
  private readonly apiService = new ApiService();

  constructor(private readonly configDirectory: string) {}

  public async trackEvent<T extends DomainEvent>(event: T, shell: string): Promise<void> {
    const authInfo = await this.getAuthInfo(this.configDirectory);
    const telemetryOptedOut = process.env.APIMATIC_CLI_TELEMETRY_OPTOUT === "1";
    const authKey = authInfo?.authKey;

    if (telemetryOptedOut || authInfo?.APIMATIC_CLI_TELEMETRY_OPTOUT === "1" || !authKey) {
      return;
    }

    const payload: TelemetryPayload = {
      payload: event,
      timestamp: new Date().toISOString(),
      cliVersion: envInfo.getCLIVersion(),
      platform: os.platform(),
      releaseVersion: os.release(),
      nodeVersion: process.version
    };

    const result = await this.apiService.sendTelemetry(JSON.stringify(payload), authKey, shell);
    // eslint-disable-next-line no-undef
    result.mapErr((err) => console.log(err));
  }

  private async getAuthInfo(configDirectory: string): Promise<AuthInfo | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(configDirectory, "config.json"), "utf8"));
    } catch {
      return null;
    }
  }
}
