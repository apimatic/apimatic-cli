import { BuildContext } from "../../types/build-context.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../../infrastructure/file-service.js";

export type ResolvedBuildResult =
  | {
      readonly status: "resolved";
      readonly buildDirectory: DirectoryPath;
      readonly buildContext: BuildContext;
      readonly version?: string;
    }
  | {
      readonly status: "versionedEmpty";
      readonly versionsDirectory: DirectoryPath;
    }
  | {
      readonly status: "versionNotFound";
    }
  | {
      readonly status: "cancelled";
    };

export class VersionedBuildResolver {
  private readonly fileService = new FileService();

  public async resolve(
    buildDirectory: DirectoryPath,
    apiVersion: string | undefined,
    selectVersion: (versions: string[]) => Promise<string | undefined>
  ): Promise<ResolvedBuildResult> {
    const buildContext = new BuildContext(buildDirectory);
    if (!(await buildContext.validate())) {
      return {
        status: "resolved",
        buildDirectory: buildContext.getBuildDirectory(),
        buildContext
      };
    }

    const config = await buildContext.getBuildFileContents();
    if (!("generateVersionedPortal" in config)) {
      return {
        status: "resolved",
        buildDirectory: buildContext.getBuildDirectory(),
        buildContext
      };
    }

    const versionsPath = (config.versionsPath as string) ?? "versioned_docs";
    const versionsDirectory = buildDirectory.join(versionsPath);

    if (!(await this.fileService.directoryExists(versionsDirectory))) {
      return { status: "versionedEmpty", versionsDirectory };
    }

    const versionsDirs = await this.fileService.getSubDirectoriesPaths(versionsDirectory);
    const versions = versionsDirs.map((dir) => dir.leafName());

    if (versions.length === 0) {
      return { status: "versionedEmpty", versionsDirectory };
    }

    const selectedVersion = apiVersion ?? (await selectVersion(versions));
    if (!selectedVersion) {
      return { status: "cancelled" };
    }

    if (!versions.includes(selectedVersion)) {
      return { status: "versionNotFound" };
    }

    const resolvedBuildDirectory = versionsDirectory.join(selectedVersion);
    return {
      status: "resolved",
      buildDirectory: resolvedBuildDirectory,
      buildContext: new BuildContext(resolvedBuildDirectory),
      version: selectedVersion
    };
  }
}