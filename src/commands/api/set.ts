import { log } from "../../utils/log";
import { Command, flags } from "@oclif/command";
import { getAPIEntity, setAPIEntity } from "../../client-utils/auth-manager";

export default class ApiSet extends Command {
  static description = "Set a single API Entity Id globally for all the API Entity related commands";
  static examples = [
    `$ apimatic api:set --api-entity="123nhjkh123"
API Entity has been set successfully
  `,
    `$ apimatic api:set --status"
API Entity currently set is 123nhjkh123
  `,
    `$ apimatic api:set --clear"
API Entity has been cleared
`
  ];
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
        log.success(response);
      } else {
        const apiEntityId: string | undefined = await getAPIEntity(this.config.configDir);
        log.success(apiEntityId ? `API Entity currently set is ${apiEntityId}` : "No API Entity set");
      }
    } catch (error) {
      log.error((error as Error).message);
    }
  }
}