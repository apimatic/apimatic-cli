import { Client } from "@apimatic/apimatic-sdk-for-js";
import { setCredentials, getCredentials } from "./credentialsManager";
/**
 * The Singleton class defines the `getInstance` method that lets clients access
 * the unique singleton instance.
 */
export class CLIClient {
  private static instance: CLIClient;
  public static client: Client;

  /**
   * The CLIClient's constructor should always be private to prevent direct
   * construction calls with the `new` operator.
   */

  /**
   * The static method that controls the access to the CLIClient instance.
   *
   * This implementation let you subclass the CLIClient class while keeping
   * just one instance of each subclass around.
   */
  public static getInstance(): CLIClient {
    if (!CLIClient.instance) {
      CLIClient.instance = new CLIClient();
    }

    return CLIClient.instance;
  }

  /**
   * Finally, any CLIClient should define some business logic, which can be
   * executed on its instance.
   */
  public async login(email: string, token: string, configDir: string): Promise<string> {
    const storedCredentials = await getCredentials(configDir);

    if (storedCredentials.email !== email || storedCredentials.token !== token) {
      try {
        setCredentials(
          {
            email,
            token
          },
          configDir
        );

        return "Logged In";
      } catch (error) {
        return JSON.stringify(error);
      }
    } else {
      return "Already logged In";
    }
  }

  public async logout(configDir: string): Promise<string> {
    try {
      setCredentials(
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
      const credentials = await getCredentials(configDir);

      return credentials.email !== "" && credentials.token !== ""
        ? `Currently logged in as ${credentials.email}`
        : "Not Logged In";
    } catch (error: any) {
      throw new Error(error as string);
    }
  }

  public async getClient(configDir: string): Promise<Client> {
    const storedCredentials = await getCredentials(configDir);

    if (storedCredentials.email !== "" && storedCredentials.token !== "") {
      return new Client({
        timeout: 0,
        email: storedCredentials.email,
        password: storedCredentials.token
      });
    } else {
      throw new Error("Please login first or provide an authKey");
    }
  }
}
