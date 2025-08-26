import { Client } from "@apimatic/sdk";
import { AuthInfo, getAuthInfo, removeAuthInfo } from "./auth-manager.js";

/**
 * The Singleton class defines the `getInstance` method that lets clients access
 * the unique singleton instance.
 */
export class SDKClient {
  public static client: Client;
  private static instance: SDKClient;

  /**
   * The static method that controls the access to the SDKClient instance.
   *
   * This implementation let you subclass the SDKClient class while keeping
   * just one instance of each subclass around.
   */
  public static getInstance(): SDKClient {
    if (!SDKClient.instance) {
      SDKClient.instance = new SDKClient();
    }

    return SDKClient.instance;
  }

  public async status(configDir: string): Promise<string> {
    try {
      let storedAuthInfo: AuthInfo | null = await getAuthInfo(configDir);

      if (!storedAuthInfo) {
        // If no config file or no credentials exist in the config file
        storedAuthInfo = { email: "", authKey: "" };
      }

      return storedAuthInfo.email === "" && storedAuthInfo.authKey === ""
        ? "Not logged in"
        : storedAuthInfo.email === "" && storedAuthInfo.authKey !== ""
        ? "Logged in with authentication key"
        : `Currently logged in as ${storedAuthInfo.email}`;
    } catch (error) {
      throw error as Error;
    }
  }
}
