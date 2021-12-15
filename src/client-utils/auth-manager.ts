import * as path from "path";
import * as fs from "fs-extra";

export type AuthInfo = {
  email: string;
  authKey: string;
  apiEntityId?: string;
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

/**
 *
 * @param {string} configDir <- Directory with user configuration
 * //Function to get credentials
 */
export async function getAPIEntity(configDir: string): Promise<string | undefined> {
  try {
    const data: AuthInfo | null = JSON.parse(await fs.readFile(path.join(configDir, "config.json"), "utf8"));

    if (data?.apiEntityId) {
      return data.apiEntityId;
    } else {
      return undefined;
    }
  } catch (e) {
    return "Error reading config file";
  }
}

/**
 *
 * @param {string} configDir <- Directory with user configuration
 * @param {string} apiEntityId <- API entity ID
 * //Function to set API Entity Id
 */
export async function setAPIEntity(apiEntityId: string | undefined, configDir: string): Promise<string> {
  try {
    if (!apiEntityId) {
      throw new Error("Please provide an API Entity ID to set");
    }
    const configFilePath = path.join(configDir, "config.json");
    if (!fs.existsSync(configFilePath)) fs.createFileSync(configFilePath);

    // Get current config data and append entity ID
    const data: AuthInfo | null = JSON.parse(await fs.readFile(path.join(configDir, "config.json"), "utf8"));
    const entityData = data ? { ...data, apiEntityId } : { apiEntityId };

    // Write API entity ID to config file
    await fs.writeFile(configFilePath, JSON.stringify(entityData));

    return "API Entity ID has been set successfully";
  } catch (error) {
    throw new Error((error as Error).message);
  }
}
