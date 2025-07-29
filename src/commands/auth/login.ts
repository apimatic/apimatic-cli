
import { Flags, Command } from "@oclif/core";
import { v4 as uuidv4 } from "uuid";
import open from "open";
import axios, { AxiosRequestConfig } from "axios";
import https from "https";
import { setAuthInfo } from "../../client-utils/auth-manager.js";

export default class Login extends Command {
  static description = "Login using your APIMatic credentials or an API Key";

  static examples = [`apimatic auth:login`, `apimatic auth:login --auth-key={api-key}`];

  private static readonly AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes timeout

  static flags = {
    "auth-key": Flags.string({ default: "", description: "Sets authentication key for all commands." })
  };

  async run() {
    const {
      flags: { "auth-key": authKey }
    } = await this.parse(Login);

    if (authKey) {
      this.log("Using provided authentication key");
      return authKey;
    }

    const state = uuidv4();
    this.log("Opening browser for authentication...");
    await open(`https://localhost:44000/deviceauth/login?state=${state}`);

    while (true) {
      const httpsConfig: AxiosRequestConfig = {
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      };
      const response = await axios.get(`https://localhost:44000/deviceauth/token?state=${state}`, httpsConfig);

      if (response.data && typeof response.data.apiKey === "string") {
        this.log("Successfully authenticated!");
        const apiKey = response.data.apiKey;


        await setAuthInfo("myeamil", apiKey, false, this.config.configDir);
        this.log("api-key saved");
        return;
        // TODO: call subscription info to validate apiKey;

      } else {
        this.log("Invalid token format received");
      }

      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay between polls
    }
  }
}
