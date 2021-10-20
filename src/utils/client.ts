import { Client, DocsPortalManagementController } from "@apimatic/apimatic-sdk-for-js";
import { setCredentials, getCredentials } from "../credentialsManager";
/**
 * The Singleton class defines the `getInstance` method that lets clients access
 * the unique singleton instance.
 */
export class LoginClient {
  private static instance: LoginClient;
  public static client: Client;
  public static docsPortalManagementController: DocsPortalManagementController;
  public static email = "";
  public static password = "";

  /**
   * The LoginClient's constructor should always be private to prevent direct
   * construction calls with the `new` operator.
   */

  /**
   * The static method that controls the access to the LoginClient instance.
   *
   * This implementation let you subclass the LoginClient class while keeping
   * just one instance of each subclass around.
   */
  public static getInstance(): LoginClient {
    if (!LoginClient.instance) {
      LoginClient.instance = new LoginClient();
    }

    return LoginClient.instance;
  }

  /**
   * Finally, any LoginClient should define some business logic, which can be
   * executed on its instance.
   */
  public async login(email: string, token: string, configDir: string): Promise<string> {
    const storedCredentials = await getCredentials(configDir);

    if (storedCredentials.email !== email || storedCredentials.token !== token) {
      try {
        LoginClient.client = new Client({
          timeout: 0,
          email,
          password: token
        });
        LoginClient.docsPortalManagementController = new DocsPortalManagementController(LoginClient.client);

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
}
