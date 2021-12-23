import { Command, flags } from "@oclif/command";
import { getAPIEntity, setAPIEntity } from "../../client-utils/auth-manager";

export default class ApiSet extends Command {
  static description = "Set a single API Entity Id globally for all the API Entity related commands";

  static flags = {
    status: flags.boolean({
      default: false,
      exclusive: ["api-entity"],
      description: "show currently set API Entity"
    }),
    clear: flags.boolean({ default: false, exclusive: ["api-entity"], description: "clear the stored API Entity" }),
    "api-entity": flags.string({ default: "", exclusive: ["status"], description: "API Entity ID of the API" })
  };

  async run() {
    const { flags } = this.parse(ApiSet);

    try {
      if (!flags.status) {
        const response = await setAPIEntity(flags, this.config.configDir);
        this.log(response);
      } else {
        const apiEntityId: string | undefined = await getAPIEntity(this.config.configDir);
        this.log(apiEntityId ? `API Entity currently set is ${apiEntityId}` : "No API Entity set");
      }
    } catch (error) {
      this.error((error as Error).message);
    }
  }
}
