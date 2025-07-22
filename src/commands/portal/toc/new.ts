import * as path from "path";
import { Command, Flags } from "@oclif/core";
import { PortalNewTocAction } from "../../../actions/portal/toc/new-toc.js";
import { DirectoryPath } from "../../../types/file/directoryPath.js";

const DEFAULT_WORKING_DIRECTORY = "./";

export default class PortalTocNew extends Command {
  static summary =
    "Generates a TOC file based on the content directory and spec folder provided in your working directory";

  static description = `This command generates a new Table of Contents (TOC) file used in the
generation of your API documentation portal.

The output is a YAML file with the .yml extension.

To learn more about the TOC file and APIMatic build directory structure, visit:
https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/overview-generating-api-portal`;

  static flags = {
    destination: Flags.string({
      description: "[default: ./build/content] optional path where the generated toc.yml file will be saved."
    }),
    folder: Flags.string({
      description:
        "[default: ./] path to the parent directory containing the 'build' folder, which includes API specifications and configuration files."
    }),
    force: Flags.boolean({
      default: false,
      description: "overwrite the 'toc.yml' file if one already exists at the destination."
    }),
    "expand-endpoints": Flags.boolean({
      default: false,
      description:
        "include individual entries for each endpoint in the generated 'toc.yml'. Requires a valid API specification in the working directory."
    }),
    "expand-models": Flags.boolean({
      default: false,
      description:
        "include individual entries for each model in the generated 'toc.yml'. Requires a valid API specification in the working directory."
    })
  };

  static examples = [
    `$ apimatic portal:toc:new --destination="./portal/content/"
A new toc file has been created at ./portal/content/toc.yml
`,
    `$ apimatic portal:toc:new --folder="./my-project" 
A new toc file has been created at ./my-project/content/toc.yml
`,
    `$ apimatic portal:toc:new --folder="./my-project" --destination="./portal/content/"
A new toc file has been created at ./portal/content/toc.yml
`
  ];

  constructor(argv: string[], config: any) {
    super(argv, config);
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(PortalTocNew);
    const portalNewTocAction = new PortalNewTocAction();

    const workingDirectory = new DirectoryPath(flags.folder ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = flags.folder ? new DirectoryPath(flags.folder, "build") : workingDirectory.join("build");

    let tocDirectory: DirectoryPath | undefined;

    if (flags.destination) {
      tocDirectory = new DirectoryPath(flags.destination);
    }

    const result = await portalNewTocAction.createToc(
      buildDirectory,
      this.config.configDir,
      tocDirectory,
      flags.force,
      flags["expand-endpoints"],
      flags["expand-models"]
    );

    if (result.isFailed()) {
      this.error(result.error!);
    }
  }
}
