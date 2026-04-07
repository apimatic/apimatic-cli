import * as path from "path";
import { FilePath } from "./filePath.js";
import { LeafNode, TreeNode, getTree } from "../../prompts/format.js";

export interface PathTreeEntry {
  path: FilePath;
  description?: string;
}

export class DirectoryPath {
  private readonly directoryPath: string;

  constructor(directoryPath: string, ...subPaths: string[]) {
    this.directoryPath = path.resolve(directoryPath, ...subPaths);
  }

  public static default = new DirectoryPath("./");

  public static createInput(input: string | undefined) {
    if (!input) {
      return DirectoryPath.default;
    }
    return new DirectoryPath(input);
  }

  public toString(): string {
    return this.directoryPath;
  }

  public join(...subPath: string[]) {
    return new DirectoryPath(path.join(this.directoryPath, ...subPath));
  }

  public isEqual(other: DirectoryPath) {
    return this.directoryPath === other.directoryPath;
  }

  public leafName() {
    return path.basename(this.directoryPath);
  }

  public buildFilePathTree( entries: PathTreeEntry[]): string {
  const root: TreeNode = { name: this.leafName(), items: [] };
  for (const entry of entries) {
    const relativePath = path.relative(this.toString(), entry.path.toString());
    const parts = relativePath.split(/[\\/]/);
    let currentLevel = root.items;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLastPart = i === parts.length - 1;

      if (isLastPart) {
        currentLevel.push({
          name: part,
          description: entry.description
        });
      } else {
        let existingDir = currentLevel.find(
          (item: TreeNode | LeafNode) => "items" in item && item.name === part
        ) as TreeNode | undefined;

        if (!existingDir) {
          existingDir = { name: part, items: [] };
          currentLevel.push(existingDir);
        }

        currentLevel = existingDir.items;
      }
    }
  }

  return getTree(root);
}
}
