import { DirectoryPath } from "./directoryPath.js";
import { FileName } from "./fileName.js";
import { TocCustomPage, TocGroup } from "../toc/toc.js";
import { FilePath } from "./filePath.js";


export type DirectoryItem = FileName | Directory;

export class Directory {
  public readonly directoryPath: DirectoryPath;
  public readonly items: DirectoryItem[];

  public constructor(directoryPath: DirectoryPath, filePaths: DirectoryItem[]) {
    this.directoryPath = directoryPath;
    this.items = filePaths;
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
