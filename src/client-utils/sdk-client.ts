import { Client } from "@apimatic/sdk";
import { baseURL } from "../config/env.js";
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

  public async logout(configDir: string): Promise<string> {
    await removeAuthInfo(configDir);
    return "Logged out";
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

  public async getClient(overrideAuthKey: string | null, configDir: string): Promise<Client> {
    if (overrideAuthKey) {
      return new Client({
        timeout: 0,
        customHeaderAuthenticationCredentials: {
          Authorization: `X-Auth-Key ${overrideAuthKey}`
        }
      });
    }
    let storedAuthInfo: AuthInfo | null = await getAuthInfo(configDir);

    if (!storedAuthInfo) {
      // If no config file or no credentials exist in the config file
      storedAuthInfo = { email: "", authKey: "" };
    }
    if (storedAuthInfo.authKey !== "") {
      return new Client({
        timeout: 0,
        customHeaderAuthenticationCredentials: {
          Authorization: `X-Auth-Key ${storedAuthInfo.authKey}`
        }
      });
    } else {
      throw new Error("Please login first or provide an authKey");
    }
  }
}
