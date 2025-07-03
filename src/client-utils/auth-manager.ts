import * as path from "path";
import fsExtra from "fs-extra";

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
    const data: AuthInfo | null = JSON.parse(await fsExtra.readFile(path.join(configDir, "config.json"), "utf8"));
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

  if (!fsExtra.existsSync(configFilePath)) fsExtra.createFileSync(configFilePath);

  return await fsExtra.writeFile(configFilePath, JSON.stringify(credentials));
}
