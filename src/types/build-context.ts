import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { File } from "./file/file.js";
import { BuildConfig } from "./build/build.js";
import { TocCustomPage, TocGroup } from "./toc/toc.js";
import { err, ok, Result } from "neverthrow";
import { Directory } from "./file/directory.js";

export class BuildContext {
  private readonly fileService = new FileService();
  private readonly buildDirectory: DirectoryPath;

  constructor(buildDirectory: DirectoryPath) {
    this.buildDirectory = buildDirectory;
  }

  private get BuildFile(): FilePath {
    // TODO: add checks for build file path
    return new FilePath(this.buildDirectory, new FileName("APIMATIC-BUILD.json"));
  }

  public async validate(): Promise<boolean> {
    // TODO: add more checks here
    if (!(await this.fileService.directoryExists(this.buildDirectory))) return false;

    return await this.fileService.fileExists(this.BuildFile);
  }

  public async exists(): Promise<boolean> {
    return !(await this.fileService.directoryEmpty(this.buildDirectory));
  }

  public async getBuildFileContents(): Promise<BuildConfig> {
    const buildFileContent = await this.fileService.getContents(this.BuildFile);
    return JSON.parse(buildFileContent) as BuildConfig;
  }

  public async updateBuildFileContents(buildJson: BuildConfig) {
    await this.fileService.writeContents(this.BuildFile, JSON.stringify(buildJson, null, 2));
  }

  public async extractContentGroups(): Promise<Result<TocGroup[], string>> {
    const contentFolderPath = this.buildDirectory.join("content");

    if (!(await this.fileService.directoryExists(contentFolderPath))) {
      return err(`Content folder not found at: ${contentFolderPath}`);
    }
    const directory = await Directory.parseFromDirectoryPath(contentFolderPath);
    return ok(await this.parseContentFolder(directory, contentFolderPath));
  }

   private async parseContentFolder(directory: Directory, baseContentPath: DirectoryPath): Promise<TocGroup[]> {      
      const contentItems: (TocGroup | TocCustomPage)[] = [];
  
      for (const item of directory.items) {
        if (item instanceof Directory && directory.items.length > 0) {
            contentItems.push({
              group: item.toString(),
              items: await this.parseContentFolder(item, baseContentPath)
            });
        } else if (item instanceof File && item.getExtension() === ".md") {
          const relativePath = await this.fileService.getRelativePath(baseContentPath, item.filePath);
          const pageName = item.getNameWithoutExtension();
          contentItems.push({
            page: pageName,
            file: this.normalizePath(relativePath)
          });
        }
      }
  
      // Return empty array if no markdown files were found
      if (contentItems.length === 0) {
        return [];
      }
  
      // Wrap everything under a "Custom Content" group
      return [
        {
          group: "Custom Content",
          items: contentItems
        }
      ];
    }
  
    private normalizePath(path: string): string {
      return path.replace(/\\/g, "/");
    } 
}
