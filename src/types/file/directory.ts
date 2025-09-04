import { DirectoryPath } from "./directoryPath.js";
import { FileName } from "./fileName.js";
import { TocCustomPage, TocGroup } from "../toc/toc.js";
import { FilePath } from "./filePath.js";
import { TreeNode } from "../../prompts/format.js";

export type DirectoryItem = FileName | Directory;

export class Directory {
  public readonly directoryPath: DirectoryPath;
  public readonly items: DirectoryItem[];

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
    "APIMATIC-BUILD.json": "# Defines all configurations for the API portal, including programming languages and themes"
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
    const contentItems: (TocGroup | TocCustomPage)[] = [];

    for (const item of this.items) {
      if (item instanceof Directory) {
        contentItems.push({
          group: item.toString(),
          items: await item.parseContentFolder(baseContentPath)
        });
      } else {
        if (item.isMarkDown()) {
          const filePath = new FilePath(this.directoryPath, item);
          contentItems.push({
            page: filePath.toString(),
            file: new FilePath(baseContentPath, item.normalize()).toString(),
          });
        }
      }
    }

    // Return empty if no mark-down files were found
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
}
