import { Command, Config, Flags } from "@oclif/core";
import { PortalGeneratePrompts } from "../../prompts/portal/generate.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { FilePath } from "../../types/file/filePath.js";
import { FileName } from "../../types/file/fileName.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDir } from "tmp-promise";

const DEFAULT_WORKING_DIRECTORY = "./";

export class PortalGenerate extends Command {
  static description =
    "Generate and download a static API Documentation portal. Requires an input directory containing API specifications, a config file and optionally, markdown guides. For details, refer to the [documentation](https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/build-file-reference)";

  static flags = {
    folder: Flags.string({
      description: "path to the input directory containing API specifications and config files"
    }),
    destination: Flags.string({
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
  private readonly zipArchiver: ZipService;
  private readonly fileService: FileService;
  private readonly portalService: PortalService;

  constructor(argv: string[], config: Config) {
    super(argv, config);
    this.prompts = new PortalGeneratePrompts();
    this.zipArchiver = new ZipService();
    this.fileService = new FileService();
    this.portalService = new PortalService();
  }

  async run(): Promise<void> {
    const { flags: { folder, destination, force, zip: zipPortal } } = await this.parse(PortalGenerate);

    const workingDirectory = new DirectoryPath(folder ?? DEFAULT_WORKING_DIRECTORY);
    const buildDirectory = folder ? new DirectoryPath(folder) : workingDirectory.join("build");
    const portalDirectory = destination ? new DirectoryPath(destination) : workingDirectory.join("portal");

    if (buildDirectory.isEqual(portalDirectory)) {
      this.error("build directory and portal directory cannot be the same");
    }

    if (!await this.validateBuild(buildDirectory)) {
      this.error("build directory is empty or not valid");
    }

    if (!await this.validatePortal(portalDirectory, force)) {
      this.error("portal directory is empty or not valid");
    }

    await withDir(async (o) => {
      this.prompts.displayPortalGenerationMessage();

      const tempDirectory = new DirectoryPath(o.path);

      const buildZipPath = new FilePath(tempDirectory, new FileName("build.zip"));
      await this.zipArchiver.archive(buildDirectory, buildZipPath);

      const buildStream = await this.portalService.generatePortal(buildZipPath, this.getConfigDir());
      this.prompts.displayPortalGenerationSuccessMessage();

      const tempPortalFilePath = new FilePath(tempDirectory, new FileName("portal.zip"));
      await this.fileService.writeFile(tempPortalFilePath, <NodeJS.ReadableStream>buildStream);

      await this.fileService.cleanDirectory(portalDirectory);
      if (zipPortal) {
        const portalFilePath = new FilePath(portalDirectory, new FileName("portal.zip"));
        await this.fileService.copy(tempPortalFilePath, portalFilePath);
      } else {
        await this.zipArchiver.unArchive(tempPortalFilePath, portalDirectory);
      }
    }, { unsafeCleanup: true }); // also removes nested files & dirs
  }

  private getConfigDir = () => {
    return new DirectoryPath(this.config.configDir);
  };

  private async validateBuild(buildDirectory: DirectoryPath) {
    // TODO: add more checks here
    return await this.fileService.directoryExists(buildDirectory);
  }

  private async validatePortal(portalDirectory: DirectoryPath, forceCleanup: boolean): Promise<boolean> {
    const isEmptyOrNotExists = await this.fileService.directoryEmpty(portalDirectory);
    if (isEmptyOrNotExists) return true;
    return forceCleanup || await this.prompts.overwritePortal(portalDirectory);
  }
}
