import * as path from "path";
import { Command, Flags } from "@oclif/core";
import { PortalNewTocAction } from "../../../actions/portal/new/toc";

const DEFAULT_FOLDER = "./";

export default class PortalNewToc extends Command {
  static description =
    "Create a new table of contents (toc) file for your API Documentation portal. The generated file will be a YAML file with the .yml extension.";

  static flags = {
    destination: Flags.string({
      parse: async (input: string) => path.resolve(input),
      description: "path where the toc file will be created"
    }),
    folder: Flags.string({
      parse: async (input: string) => path.resolve(input),
      description: "path of the working directory",
      default: DEFAULT_FOLDER
    }),
    force: Flags.boolean({
      default: false,
      description: "overwrite if a toc file exists in the destination"
    }),
    "expand-endpoints": Flags.boolean({
      default: false,
      description: "use individual endpoints generation instead of SDL-based endpoints"
    }),
    "expand-models": Flags.boolean({
      default: false,
      description: "use individual models generation instead of SDL-based models"
    })
  };

  static examples = [
    `$ apimatic portal:new:toc --destination="./portal/content/"
A new toc file has been created at ./portal/content/toc.yml
`,
    `$ apimatic portal:new:toc --folder="./my-project" --destination="./portal/content/"
A new toc file has been created at ./portal/content/toc.yml using ./my-project as working directory
`
  ];

  constructor(argv: string[], config: any) {
    super(argv, config);
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(PortalNewToc);
    const portalNewTocAction = new PortalNewTocAction();
    const result = await portalNewTocAction.createToc(
      flags.folder,
      this.config.configDir,
      flags.destination,
      flags.force,
      flags["expand-endpoints"],
      flags["expand-models"]
    );

    if (result.isFailed()) {
      this.error(result.error!);
    }
  }
} 