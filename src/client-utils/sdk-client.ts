import * as base64 from "base-64";
import axios, { AxiosResponse } from "axios";
import { Client } from "@apimatic/apimatic-sdk-for-js";
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
  private static instance: SDKClient;
  private static authAPI = "https://www.apimatic.io/api/account/authkey";
  public static client: Client;

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
      storedAuthInfo = { email: "", token: "" };
    }

    const credentials: Credentials = { email, password };
    const authKey: string = await this.getAuthKey(credentials);

    if (storedAuthInfo.email !== email) {
      try {
        setAuthInfo(
          {
            email,
            token: authKey
          },
          configDir
        );

        return "Logged In";
      } catch (error: any) {
        console.log(error);
        throw new Error(error);
      }
    } else {
      if (authKey === storedAuthInfo.token) {
        return "Already logged in";
      }
      setAuthInfo(
        {
          email,
          token: authKey
        },
        configDir
      );
      return "Logged in";
    }
  }

  public async logout(configDir: string): Promise<string> {
    try {
      setAuthInfo(
        {
          email: "",
          token: ""
        },
        configDir
      );
      return "Logged out";
    } catch (error: unknown) {
      throw new Error(error as string);
    }
  }

  public async status(configDir: string): Promise<string> {
    try {
      let storedAuthInfo: AuthInfo | null = await getAuthInfo(configDir);

      if (!storedAuthInfo) {
        // If no config file or no credentials exist in the config file
        storedAuthInfo = { email: "", token: "" };
      }

      return storedAuthInfo.email !== "" && storedAuthInfo.token !== ""
        ? `Currently logged in as ${storedAuthInfo.email}`
        : "Not Logged In";
    } catch (error: any) {
      throw new Error(JSON.stringify(error));
    }
  }

  public async getClient(configDir: string): Promise<Client> {
    let storedAuthInfo: AuthInfo | null = await getAuthInfo(configDir);

    if (!storedAuthInfo) {
      // If no config file or no credentials exist in the config file
      storedAuthInfo = { email: "", token: "" };
    }
    if (storedAuthInfo.email !== "" && storedAuthInfo.token !== "") {
      return new Client({
        timeout: 0,
        email: storedAuthInfo.email,
        password: storedAuthInfo.token
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

    try {
      const response: AxiosResponse = await axios.get(SDKClient.authAPI, config);
      const token: string = response.data.EncryptedValue;
      return token;
    } catch (error: any) {
      throw new Error(error);
    }
  }
}
