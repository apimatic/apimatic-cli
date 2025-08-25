import * as path from "path";
import fs from "fs-extra";
import { DirectoryPath } from "../types/file/directoryPath.js";

export type AuthInfo = {
  email: string;
  authKey: string;
  APIMATIC_CLI_TELEMETRY_OPTOUT?: string;
};
/**
 *
 * @param {string} configDir <- Directory with user configuration
 * //Function to get credentials
 */
export async function getAuthInfo(configDir: string): Promise<AuthInfo | null> {
  try {
    const data: AuthInfo | null = JSON.parse(await fs.readFile(path.join(configDir, "config.json"), "utf8"));
    return data;
  } catch {
    return null;
  }
}

/**
 *
 * @param {string} email
 * @param {string} authKey
 * @param {string} isTelemetryOptedOut
 * @param {string} configDir <- Directory with user configuration
 * //Function to set credentials.
 */
export async function setAuthInfo(
  email: string,
  authKey: string,
  isTelemetryOptedOut: boolean,
  configDir: DirectoryPath
): Promise<void> {
  const credentials: AuthInfo = {
    email,
    authKey,
    APIMATIC_CLI_TELEMETRY_OPTOUT: isTelemetryOptedOut ? "1" : "0"
  };
  const configFilePath = path.join(configDir.toString(), "config.json");

  if (!fs.existsSync(configFilePath)) fs.createFileSync(configFilePath);

  return await fs.writeFile(configFilePath, JSON.stringify(credentials));
}

export async function removeAuthInfo(configDir: DirectoryPath): Promise<void> {
  const credentials: AuthInfo = {
    email: "",
    authKey: ""
  };
  const configFilePath = path.join(configDir.toString(), "config.json");

  if (!fs.existsSync(configFilePath)) fs.createFileSync(configFilePath);

  return await fs.writeFile(configFilePath, JSON.stringify(credentials));
}
