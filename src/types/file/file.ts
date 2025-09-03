import { FileName } from './fileName.js';
import { FilePath } from './filePath.js';
import * as path from "path";

export class File {
  public readonly filePath: FilePath;
  private readonly fileName: FileName;

  public constructor(filePath: FilePath) {
    this.filePath = filePath;
    this.fileName = new FileName(path.basename(filePath.toString()));
  }

  public getNameWithoutExtension(): string {
    return this.fileName.toString().replace(/\.[^/.]+$/, "");
  }

  public getExtension(): string {
    return path.extname(this.filePath.toString());
  }
}
