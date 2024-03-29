import * as base64 from "base-64";
import axios, { AxiosResponse } from "axios";

import { Client } from "@apimatic/sdk";
import { baseURL } from "../config/env";
import { setAuthInfo, getAuthInfo, AuthInfo } from "./auth-manager";
/**
 * The Singleton class defines the `getInstance` method that lets clients access
 * the unique singleton instance.
 */
type Credentials = {
  email: string;
  password: string;
};
export class SDKClient {
  public static client: Client;
  private static instance: SDKClient;
  private static authAPI = `${baseURL}/account/authkey`;

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

  /**
   * Finally, any SDKClient should define some business logic, which can be
   * executed on its instance.
   */

  public async login(email: string, password: string, configDir: string): Promise<string> {
    let storedAuthInfo: AuthInfo | null = await getAuthInfo(configDir);

    // If no config file or no credentials exist in the config file
    if (!storedAuthInfo) {
      storedAuthInfo = { email: "", authKey: "" };
    }

    const credentials: Credentials = { email, password };
    const authKey: string = await this.getAuthKey(credentials);

    if (storedAuthInfo.email !== email) {
      setAuthInfo(
        {
          email,
          authKey
        },
        configDir
      );

      return "Logged in";
    } else if (authKey === storedAuthInfo.authKey) {
      return "Already logged in";
    } else {
      setAuthInfo(
        {
          email,
          authKey
        },
        configDir
      );
      return "Logged in";
    }
  }

  public async logout(configDir: string): Promise<string> {
    setAuthInfo(
      {
        email: "",
        authKey: ""
      },
      configDir
    );
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
        authorization: `X-Auth-Key ${overrideAuthKey}`
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
        authorization: `X-Auth-Key ${storedAuthInfo.authKey}`
      });
    } else {
      throw new Error("Please login first or provide an authKey");
    }
  }

  private async getAuthKey(credentials: Credentials): Promise<string> {
    const config = {
      headers: {
        Authorization: `Basic ${base64.encode(`${credentials.email}:${credentials.password}`)}`
      }
    };
    const response: AxiosResponse = await axios.get(SDKClient.authAPI, config);
    const authKey: string = response.data.EncryptedValue;
    return authKey;
  }
  public setAuthKey = (authKey: string, configDir: string) => {
    setAuthInfo(
      {
        email: "",
        authKey
      },
      configDir
    );
    return "Authentication key successfully set";
  };
}
