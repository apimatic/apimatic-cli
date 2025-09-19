import { DirectoryPath } from "./directoryPath.js";
import { FileName } from "./fileName.js";
import { TocCustomPage, TocGroup } from "../toc/toc.js";
import { FilePath } from "./filePath.js";
import { TreeNode } from "../../prompts/format.js";
import { FileService } from "../../infrastructure/file-service.js";

export type DirectoryItem = FileName | Directory;

export class Directory {
  public readonly directoryPath: DirectoryPath;
  public readonly items: DirectoryItem[];
  private readonly fileService = new FileService();

  public constructor(directoryPath: DirectoryPath, filePaths: DirectoryItem[]) {
    this.directoryPath = directoryPath;
    this.items = filePaths;
  }

  private static readonly folderDescriptions: Record<string, string> = {
    spec: "# Contains all API definition files",
    content: "# Includes custom documentation pages in Markdown",
    static: "# Includes all static files, such as images, GIFs, and PDFs"
  };

  private static readonly fileDescriptions: Record<string, string> = {
    "toc.yml": "# Controls the structure of the side navigation bar in the API portal",
    "APIMATIC-BUILD.json":
      "# Defines all configurations for the API portal, including programming languages and themes",
    "APIMATIC-META.json": "# Defines customization for SDK generation",
  };

  public toTreeNode(): TreeNode {
    const folderName = this.directoryPath.leafName();
    const folderDescription = Directory.folderDescriptions[folderName];

    return {
      name: folderName,
      description: folderDescription,
      items: this.items.map((item) => {
        if (item instanceof Directory) {
          return item.toTreeNode();
        }

        // file case
        const fileName = item.toString();
        const fileDescription = Directory.fileDescriptions[fileName];
        return {
          name: fileName,
          description: fileDescription
        };
      })
    };
  }

  public async parseContentFolder(baseContentPath: DirectoryPath): Promise<TocGroup[]> {
    const groups: TocGroup[] = [];
    const pages: TocCustomPage[] = [];

    for (const item of this.items) {
      if (item instanceof Directory) {
        const subGroups = await item.parseContentFolder(baseContentPath);

        if (subGroups.length > 0) {
          const directoryName = item.directoryPath.leafName();
          groups.push({
            group: directoryName,
            items: subGroups
          });
        }
      } else {
        if (item.isMarkDown()) {
          const currentFilePath = new FilePath(this.directoryPath, item);
          const relativeFilePath = this.fileService.getRelativePath(currentFilePath, baseContentPath);

          pages.push({
            page: this.getPageName(item),
            file: relativeFilePath
          });
        }
      }
    }

    const allItems: (TocGroup | TocCustomPage)[] = [...pages, ...groups];

    if (allItems.length === 0) {
      return [];
    }

    if (this.isRootContentDirectory(baseContentPath)) {
      return [
        {
          group: "Custom Content",
          items: allItems
        }
      ];
    }

    // For subdirectories, return the items directly
    return allItems as TocGroup[];
  }

  private getPageName(fileName: FileName): string {
    const fileNameStr = fileName.toString();
    return fileNameStr.replace(/\.md$/, "");
  }

  private isRootContentDirectory(baseContentPath: DirectoryPath): boolean {
    return this.directoryPath.toString() === baseContentPath.toString();
  }
}
