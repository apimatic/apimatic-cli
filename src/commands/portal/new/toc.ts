import * as path from "path";
import * as fs from "fs-extra";
import { Command, Flags } from "@oclif/core";
import { getMessageInRedColor } from "../../../utils/utils";
import { PortalNewTocPrompts } from "../../../prompts/portal/new/toc";
import { PortalNewTocAction } from "../../../actions/portal/new/toc";
import { Result } from "../../../types/common/result";

const DEFAULT_DESTINATION = path.resolve("./");
const DEFAULT_TOC_FILENAME = "toc.yml";

export default class PortalNewToc extends Command {
  static description =
    "Create a new table of contents (toc) file for your API Documentation portal. The generated file will be a YAML file with the .yml extension.";

  static flags = {
    destination: Flags.string({
      parse: async (input: string) => path.resolve(input),
      default: DEFAULT_DESTINATION,
      description: "path where the toc file will be created"
    }),
    force: Flags.boolean({
      char: "f",
      default: false,
      description: "overwrite if a toc file exists in the destination"
    })
  };

  static examples = [
    `$ apimatic portal:new:toc --destination="./portal/content/"
A new toc file has been created at ./portal/content/toc.yml
`
  ];

  private readonly prompts: PortalNewTocPrompts;

  constructor(argv: string[], config: any) {
    super(argv, config);
    this.prompts = new PortalNewTocPrompts();
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(PortalNewToc);
    const tocPath = path.join(flags.destination, DEFAULT_TOC_FILENAME);
    const portalNewTocAction = new PortalNewTocAction();

    const shouldContinueWithExistingToc = await this.checkExistingToc(tocPath, flags);
    if (!shouldContinueWithExistingToc) {
      process.exit(1);
    }

    const validationResult = await this.validatePath(flags.destination);
    if (!validationResult.isSuccess) {
      this.error(validationResult.error!);
    }

    await portalNewTocAction.createToc(tocPath);
  }

  private async validatePath(destinationPath: string): Promise<Result<string, string>> {
    if (!(await fs.pathExists(destinationPath))) {
      return Result.failure(
        getMessageInRedColor(`Destination path ${destinationPath} does not exist.`)
      );
    }

    return Result.success("Path validated successfully.");
  }

  private async checkExistingToc(tocPath: string, flags: any): Promise<boolean> {
    if (fs.existsSync(tocPath) && !flags.force) {
      if (!(await this.prompts.overwriteExistingTocPrompt())) {
        return false;
      }
    }
    return true;
  }
} 