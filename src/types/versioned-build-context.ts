import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { BuildContext } from "./build-context.js";

export type BuildValidationResult = VersionedResult | UnversionedResult | VersionedEmptyResult;

export type VersionResolutionResult = VersionResolved | VersionCancelled | VersionNotFound;

export interface UnversionedResult {
  readonly type: "unversioned";
  readonly resolvedBuild: BuildContext;
}

export interface VersionedEmptyResult {
  readonly type: "versionedEmpty";
  readonly versionsDirectory: DirectoryPath;
}

export interface VersionedResult {
  readonly type: "versioned";
  readonly versionsDirectory: DirectoryPath;
  resolveVersion(
    apiVersion: string | undefined,
    selectVersion: (versions: string[]) => Promise<string | undefined>
  ): Promise<VersionResolutionResult>;
}

export interface VersionResolved {
  readonly type: "versionResolved";
  readonly chosenVersion: string;
  readonly resolvedDirectory: DirectoryPath;
}

export interface VersionCancelled {
  readonly type: "versionCancelled";
}

export interface VersionNotFound {
  readonly type: "versionNotFound";
}

function createUnversionedResult(buildContext: BuildContext): UnversionedResult {
  return {
    type: "unversioned",
    resolvedBuild: buildContext,
  };
}

function createVersionResolved(versionsDirectory: DirectoryPath, versions: string[], chosenVersion: string): VersionResolved {
  return {
    type: "versionResolved",
    chosenVersion,
    resolvedDirectory: versionsDirectory.join(chosenVersion),
  };
}

function createVersionedEmptyResult(versionsDirectory: DirectoryPath): VersionedEmptyResult {
  return {
    type: "versionedEmpty",
    versionsDirectory
  };
}

function createVersionedResult(versionsDirectory: DirectoryPath, versions: string[]): VersionedResult {
  return {
    type: "versioned",
    versionsDirectory,
    async resolveVersion(apiVersion, selectVersion) {

      if (apiVersion) {
        if (!versions.includes(apiVersion)) {
          return {
            type: "versionNotFound"
          };
        }
        return createVersionResolved(versionsDirectory, versions, apiVersion);
      }

      const selectedVersion = await selectVersion(versions);
      if (!selectedVersion) {
        return {
          type: "versionCancelled"
        };
      }

      return createVersionResolved(versionsDirectory, versions, selectedVersion);
    },
  };
}

export class VersionedBuildContext {
  private readonly fileService = new FileService();
  private readonly buildDirectory: DirectoryPath;

  constructor(buildDirectory: DirectoryPath) {
    this.buildDirectory = buildDirectory;
  }

  public async validate(): Promise<BuildValidationResult> {
    const buildContext = new BuildContext(this.buildDirectory);
    const config = await buildContext.getBuildFileContents();
    if (!("generateVersionedPortal" in config)) return createUnversionedResult(buildContext);
    const versionsPath = (config.versionsPath as string) ?? "versioned_docs";
    const versionsDirectory = this.buildDirectory.join(versionsPath);
    if (!(await this.fileService.directoryExists(versionsDirectory))) return createVersionedEmptyResult(versionsDirectory);
    const versionsDirs = await this.fileService.getSubDirectoriesPaths(versionsDirectory);
    const versions = versionsDirs.map((dir) => dir.leafName());
    if (versions.length === 0) return createVersionedEmptyResult(versionsDirectory);
    return createVersionedResult(versionsDirectory, versions);
  }
}
