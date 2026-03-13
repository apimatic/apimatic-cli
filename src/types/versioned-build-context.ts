import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { BuildContext } from "./build-context.js";

type VersionedBuildValidateResult = { isValid: false; } | {
  isValid: true;
  versionsDirectory: DirectoryPath;
  versions: string[];
};

export class VersionedBuildContext {
  private readonly fileService = new FileService();
  private readonly buildDirectory: DirectoryPath;

  constructor(buildDirectory: DirectoryPath) {
    this.buildDirectory = buildDirectory;
  }

  public async validate(): Promise<VersionedBuildValidateResult> {
    const buildContext = new BuildContext(this.buildDirectory);
    if (!(await buildContext.validate())) {
      return { isValid: false };
    }
    const config = await buildContext.getBuildFileContents();
    if (!("generateVersionedPortal" in config)) {
      return { isValid: false };
    }
    const versionsPath = (config.versionsPath as string) ?? "versioned_docs";
    const versionsDirectory = this.buildDirectory.join(versionsPath);
    if (!(await this.fileService.directoryExists(versionsDirectory))) {
      return { isValid: false };
    }
    const versionsDirs = await this.fileService.getSubDirectoriesPaths(versionsDirectory);
    const versions = versionsDirs.map((dir) => dir.leafName());
    return { isValid: true, versionsDirectory, versions };
  }
}
