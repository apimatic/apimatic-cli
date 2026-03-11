import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { BuildContext } from "./build-context.js";

type VersionedBuildValidateResult = { isValid: false; } | {
  isValid: true;
  versionsDirectory: DirectoryPath;
  versions: string[];
};

// TODO: remove BuildContext from this class
export class VersionedBuildContext {
  private readonly fileService = new FileService();
  private readonly buildContext: BuildContext;
  private readonly buildDirectory: DirectoryPath;

  constructor(buildDirectory: DirectoryPath) {
    this.buildDirectory = buildDirectory;
    this.buildContext = new BuildContext(buildDirectory);
  }

  public async validate(): Promise<VersionedBuildValidateResult> {
    if (!(await this.buildContext.validate())) {
      return { isValid: false };
    }
    const config = await this.buildContext.getBuildFileContents();
    if (!config || !("generateVersionedPortal" in config)) {
      return { isValid: false };
    }
    const versionsPath = (config?.versionsPath as string) ?? "versioned_docs";
    const versionsDir = this.buildDirectory.join(versionsPath);
    if (!(await this.fileService.directoryExists(versionsDir))) {
      return { isValid: false };
    }
    const versionsDirs = await this.fileService.getSubDirectoriesPaths(versionsDir);
    const versions = versionsDirs.map((dir) => dir.leafName());
    return { isValid: true, versionsDirectory: versionsDir, versions: versions };
  }
}
