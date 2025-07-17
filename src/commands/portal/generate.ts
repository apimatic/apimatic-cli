import * as path from "path";
import { Command, Config, Flags } from "@oclif/core";
import { PortalGeneratePrompts } from "../../prompts/portal/generate.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../models/directoryPath.js";
import { ZipArchiver } from "../../infrastructure/zipArchiver.js";
import { FilePath } from "../../models/filePath.js";
import { FileService } from "../../infrastructure/fileService.js";
import { FileName } from "../../models/fileName.js";


const DEFAULT_FOLDER = "./";
const DEFAULT_DESTINATION = "./";
const GENERATED_PORTAL_ARTIFACTS_FOLDER = "generated_portal";
const GENERATED_PORTAL_ARTIFACTS_ZIP = ".generated_portal.zip";

export class PortalGenerate extends Command {
  static description =
    "Generate and download a static API Documentation portal. Requires an input directory containing API specifications, a config file and optionally, markdown guides. For details, refer to the [documentation](https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/build-file-reference)";

  static flags = {
    folder: Flags.string({
      default: DEFAULT_FOLDER,
      description: "path to the input directory containing API specifications and config files"
    }),
    destination: Flags.string({
      default: DEFAULT_DESTINATION,
      description: "path to the downloaded portal"
    }),
    force: Flags.boolean({
      char: "f",
      default: false,
      description: "overwrite if a portal exists in the destination"
    }),
    zip: Flags.boolean({
      default: false,
      description: "download the generated portal as a .zip archive"
    }),
    "auth-key": Flags.string({
      default: "",
      description: "override current authentication state with an authentication key"
    })
  };

  static examples = [
    `$ apimatic portal:generate --folder="./portal/" --destination="D:/"
Your portal has been generated at D:/
`
  ];

  private readonly prompts: PortalGeneratePrompts;
  private readonly zipArchiver: ZipArchiver;
  private readonly fileService: FileService;
  private readonly portalService: PortalService;

  constructor(argv: string[], config: Config) {
    super(argv, config);
    this.prompts = new PortalGeneratePrompts();
    this.zipArchiver = new ZipArchiver();
    this.fileService = new FileService();
    this.portalService = new PortalService()
  }

  async run(): Promise<void> {
    const {
      flags: { folder, destination, force }
    } = await this.parse(PortalGenerate);

    const workingDirectory = new DirectoryPath(path.resolve(folder));
    const buildDirectory = workingDirectory.join("build");

    if (!(await this.validateBuild(buildDirectory))) {
      this.error("build directory is empty or not valid");
    }

    const destinationDirectory = destination == DEFAULT_DESTINATION ? workingDirectory : new DirectoryPath(destination);
    const portalDirectory = destinationDirectory.join("portal");

    if (await this.validatePortal(portalDirectory, force)) {
      this.error("portal directory is empty or not valid");
    }

    // TODO: move this to temp directory
    const buildZipPath = new FilePath(workingDirectory, new FileName('build.zip'));
    // this.prompts.displayPortalGenerationMessage();

    await this.fileService.deleteFile(buildZipPath);
    // Delete zip
    await this.zipArchiver.archive(buildDirectory, buildZipPath);

    const buildStream = await this.portalService.generatePortal(buildZipPath, this.getConfigDir());

    const portalFilePath = new FilePath(workingDirectory, new FileName('portal.zip'));

    await this.fileService.writeFile(portalFilePath, <NodeJS.ReadableStream>buildStream);
  }

  private getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  }

  // New methods go here
  private async validateBuild(buildDirectory: DirectoryPath) {
    // TODO: add more checks here
    return await this.fileService.directoryExists(buildDirectory);
  }

  private async validatePortal(portalDirectory: DirectoryPath, forceCleanup: boolean): Promise<boolean> {
    const exists = await this.fileService.directoryExists(portalDirectory);
    if (exists && forceCleanup) {
      await this.fileService.deleteDirectory(portalDirectory);
      return false;
    }
    return exists;
  }
}





