import * as path from "path";
import { Command, Flags } from "@oclif/core";
import { PortalNewTocAction } from "../../../actions/portal/new/toc";

const DEFAULT_FOLDER = process.cwd();

export default class PortalNewToc extends Command {
  static description =
    "Generates a new Table of Contents (TOC) file used for the generation of your API documentation portal. The output is a YAML file with the .yml extension.";

  static flags = {
    destination: Flags.string({
      parse: async (input: string) => path.resolve(input),
      description: "optional path where the generated TOC file will be saved. Defaults to the current working directory if not provided.",
    }),
    folder: Flags.string({
      parse: async (input: string) => path.resolve(input),
      description: "path to the working directory containing the API project files. Defaults to the current working directory if not specified.",
      default: DEFAULT_FOLDER
    }),
    force: Flags.boolean({
      default: false,
      description: "overwrite the TOC file if one already exists at the destination.",
    }),
    "expand-endpoints": Flags.boolean({
      default: false,
      description: "include individual entries for each endpoint in the generated TOC. Requires a valid API specification in the working directory."
    }),
    "expand-models": Flags.boolean({
      default: false,
      description: "include individual entries for each model in the generated TOC. Requires a valid API specification in the working directory."
    })
  };

  static examples = [
    `$ apimatic portal:new:toc --destination="./portal/content/"
A new toc file has been created at ./portal/content/toc.yml
`,
    `$ apimatic portal:new:toc --folder="./my-project" 
A new toc file has been created at ./my-project/content/toc.yml
`,
    `$ apimatic portal:new:toc --folder="./my-project" --destination="./portal/content/"
A new toc file has been created at ./portal/content/toc.yml
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