import { BuildContext } from "../../types/build-context.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../../infrastructure/file-service.js";

export type ResolvedBuildResult =
  | {
      readonly status: "valid";
      readonly buildContext: BuildContext;
      readonly version?: string;
    }
  | {
      readonly status: "invalid";
    }
  | {
      readonly status: "noVersionsFound";
      readonly versionsDirectory: DirectoryPath;
    }
  | {
      readonly status: "invalidVersionSelected";
    }
  | {
      readonly status: "cancelledVersionSelection";
    };

export class VersionedBuildResolver {
  private readonly fileService = new FileService();

  public async resolve(
    buildDirectory: DirectoryPath,
    apiVersion: string | undefined,
    selectVersion: ((versions: string[]) => Promise<string | undefined>) | undefined
  ): Promise<ResolvedBuildResult> {
    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.validate())) {
      return {
        status: "invalid"
      };
    }

    const config = await buildContext.getBuildFileContents();
    if (!config.generateVersionedPortal || !selectVersion) {
      return {
        status: "valid",
        buildContext
      };
    }

    const versionsDirectory = buildDirectory.join(config.versionsPath ?? "versioned_docs");

    if (!(await this.fileService.directoryExists(versionsDirectory))) {
      return { status: "noVersionsFound", versionsDirectory };
    }

    const versionsDirs = await this.fileService.getSubDirectoriesPaths(versionsDirectory);
    const versions = versionsDirs.map((dir) => dir.leafName());

    if (versions.length === 0) {
      return { status: "noVersionsFound", versionsDirectory };
    }

    const selectedVersion = apiVersion ?? (await selectVersion(versions));
    if (!selectedVersion) {
      return { status: "cancelledVersionSelection" };
    }

    if (!versions.includes(selectedVersion)) {
      return { status: "invalidVersionSelected" };
    }

    const resolvedBuildDirectory = versionsDirectory.join(selectedVersion);
    return {
      status: "valid",
      buildContext: new BuildContext(resolvedBuildDirectory),
      version: selectedVersion
    };
  }
}