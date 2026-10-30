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
    return JSON.parse(await fs.readFile(path.join(configDir, "config.json"), "utf8"));
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

/**
 * The key a command sends: the one passed with `--auth-key`, else the saved login's, or null with
 * neither. A blank flag (say, from an unset variable) is no key, and `auth logout` blanks the saved
 * key rather than deleting the file, so both are checked for content.
 */
export async function resolveAuthKey(configDir: DirectoryPath, passed: string | null): Promise<string | null> {
  const flagged = passed?.trim() ?? "";
  if (flagged !== "") {
    return flagged;
  }
  const saved = (await getAuthInfo(configDir.toString()))?.authKey;
  return saved || null;
}
