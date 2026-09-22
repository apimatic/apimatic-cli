import { DirectoryPath } from './directoryPath.js';
import { FileName } from './fileName.js';
import { FilePath } from './filePath.js';
import { TreeNode } from '../../prompts/format.js';

export type FileItem = { fileName: FileName; description?: string };
export type DirectoryItem = FileItem | Directory;

export class Directory {
  public readonly directoryPath: DirectoryPath;
  public readonly items: DirectoryItem[];

  public constructor(directoryPath: DirectoryPath, filePaths: DirectoryItem[]) {
    this.directoryPath = directoryPath;
    this.items = filePaths;
  }

  private static readonly folderDescriptions: Record<string, string> = {
    spec: '# Contains all API definition files',
    content: '# Includes custom documentation pages in Markdown',
    static: '# Includes all static files, such as images, GIFs, and PDFs'
  };

  private static readonly fileDescriptions: Record<string, string> = {
    'apimatic.json': '# Configures the documentation portal and the context plugin',
    'APIMATIC-BUILD.json': '# Defines all configurations for SDK generation',
    'APIMATIC-META.json': '# Defines customization for SDK generation'
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

  public async mapFilesInDirectory(
    map: (rootDir: DirectoryPath, fileItem: FileItem) => Promise<FileItem | undefined>
  ): Promise<Directory> {
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

  public excluding(names: FileName[]): Directory {
    const excluded = names.map((name) => name.toString());
    const kept = this.items.filter((item) =>
      item instanceof Directory
        ? !excluded.includes(item.directoryPath.leafName())
        : !excluded.includes(item.fileName.toString())
    );
    return new Directory(this.directoryPath, kept);
  }

  public countFiles(): number {
    return this.items.reduce((total, item) => total + (item instanceof Directory ? item.countFiles() : 1), 0);
  }

  public countDirectories(): number {
    return this.items.reduce((total, item) => total + (item instanceof Directory ? 1 + item.countDirectories() : 0), 0);
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

  public static createFromRelativePaths(rootDir: DirectoryPath, fileItems: FileItem[]): Directory {
    type PendingDirectoryItem = FileItem | PendingDir;
    type PendingDir = { pendingDirPath: DirectoryPath; items: PendingDirectoryItem[] };

    const buildDirectory = (pending: PendingDir): Directory =>
      new Directory(
        pending.pendingDirPath,
        pending.items.map((item) => ('pendingDirPath' in item ? buildDirectory(item) : item))
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
            (item) => 'pendingDirPath' in item && item.pendingDirPath.leafName() === part
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
