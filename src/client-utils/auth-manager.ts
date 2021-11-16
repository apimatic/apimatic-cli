import * as fs from "fs-extra";
import * as path from "path";

export type AuthInfo = {
  email: string;
  authKey: string;
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
  } catch (e) {
    return null;
  }
}

/**
 *
 * @param {AuthInfo} credentials
 * @param {string} configDir <- Directory with user configuration
 * //Function to set credentials.
 */
export async function setAuthInfo(credentials: AuthInfo, configDir: string): Promise<void> {
  return await fs.writeFile(path.join(configDir, "config.json"), JSON.stringify(credentials));
}
