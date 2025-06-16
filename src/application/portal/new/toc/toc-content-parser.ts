import * as path from "path";
import * as fs from "fs-extra";
import { TocGroup, TocCustomPage } from "../../../../types/toc/toc";

export class TocContentParser {
  async parseContentFolder(contentFolderPath: string, workingDirectory: string): Promise<TocGroup[]> {
    const items = await fs.readdir(contentFolderPath);
    const contentItems: (TocGroup | TocCustomPage)[] = [];

    for (const item of items) {
      const itemPath = path.join(contentFolderPath, item);
      const stats = await fs.stat(itemPath);

      if (stats.isDirectory()) {
        const subItems = await this.parseContentFolder(itemPath, workingDirectory);
        if (subItems.length > 0) {
          contentItems.push({
            group: item,
            items: subItems[0].items // Take items from the Custom Content group
          });
        }
      } else if (stats.isFile() && item.endsWith(".md")) {
        const relativePath = path.relative(workingDirectory, itemPath);
        const pageName = path.basename(item, ".md");
        
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
    return [{
      group: "Custom Content",
      items: contentItems
    }];
  }
  
  private normalizePath(path: string) : string {
    return path.replace(/\\/g, '/');
  }
} 