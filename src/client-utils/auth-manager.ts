import * as path from "path";
import * as fs from "fs-extra";

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
  const configFilePath = path.join(configDir, "config.json");

  if (!fs.existsSync(configFilePath)) fs.createFileSync(configFilePath);

  return await fs.writeFile(configFilePath, JSON.stringify(credentials));
}
