import { DirectoryPath } from "./directoryPath.js";
import { FileName } from "./fileName.js";
import { TocCustomPage, TocGroup } from "../toc/toc.js";
import { FilePath } from "./filePath.js";
import { TreeNode } from "../../prompts/format.js";
import { FileService } from "../../infrastructure/file-service.js";

export type FileItem = { fileName: FileName, description?: string };
export type DirectoryItem = FileItem | Directory;

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
        const fileName = item.fileName.toString();
        const fileDescription = item.description ?? Directory.fileDescriptions[fileName];
        return {
          name: fileName,
          description: fileDescription
        };
      })
    };
  }

  public async mapFilesInDirectory(map: (rootDir: DirectoryPath, fileItem: FileItem) => Promise<FileItem | undefined>): Promise<Directory> {
    const mappedItems: DirectoryItem[] = [];

    for (const item of this.items) {
      if (item instanceof Directory) {
        const mappedSubDir = await item.mapFilesInDirectory(map);
        if (!mappedSubDir.isEmpty()) {
          mappedItems.push(mappedSubDir);
        }
        continue;
      }

      const mappedItem = await map(this.directoryPath, item);
      if (mappedItem) {
        mappedItems.push(mappedItem);
      }
    }

    return new Directory(this.directoryPath, mappedItems);
  }

  public isEmpty(): boolean {
    return this.items.length === 0;
  }

  public getAllFiles(): FilePath[] {
    const files: FilePath[] = [];
    for (const item of this.items) {
      if (item instanceof Directory) {
        files.push(...item.getAllFiles());
      } else {
        files.push(new FilePath(this.directoryPath, item.fileName));
      }
    }
    return files;
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
        if (item.fileName.toString().endsWith(".md")) {
          const currentFilePath = new FilePath(this.directoryPath, item.fileName);
          const relativeFilePath = this.fileService.getRelativePath(currentFilePath, baseContentPath);

          pages.push({
            page: this.getPageName(item.fileName),
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

  public static createFromRelativePaths(rootDir: DirectoryPath, fileItems: FileItem[]): Directory {
    type PendingDirectoryItem = FileItem | PendingDir;
    type PendingDir = { pendingDirPath: DirectoryPath; items: PendingDirectoryItem[] };

    const buildDirectory = (pending: PendingDir): Directory => new Directory(
      pending.pendingDirPath,
      pending.items.map((item) => ("pendingDirPath" in item ? buildDirectory(item) : item))
    );

    const root: PendingDir = { pendingDirPath: rootDir, items: [] };
    for (const file of fileItems) {
      const parts = file.fileName.toString().split(/[\\/]/);
      let currentDir = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;

        if (isLastPart) {
          currentDir.items.push({ fileName: new FileName(part), description: file.description });
        } else {
          let existingDir = currentDir.items.find(
            (item) => "pendingDirPath" in item && item.pendingDirPath.leafName() === part
          ) as PendingDir | undefined;

          if (!existingDir) {
            existingDir = { pendingDirPath: currentDir.pendingDirPath.join(part), items: [] };
            currentDir.items.push(existingDir);
          }

          currentDir = existingDir;
        }
      }
    }

    return buildDirectory(root);
  }
}
