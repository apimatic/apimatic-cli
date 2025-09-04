import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { Toc } from "./toc/toc.js";
import { parse } from "yaml";

export class TocContext {
  private readonly fileService = new FileService();
  private readonly tocFilePath: FilePath;

  constructor(tocDirectory: DirectoryPath) {
    this.tocFilePath = new FilePath(tocDirectory, new FileName("toc.yml"));
  }

  public get tocPath(): FilePath {
    return this.tocFilePath;
  }

  public async exists() {
    return !(await this.fileService.fileExists(this.tocFilePath));
  }

  public async parseTocData(): Promise<Toc> {
    const tocContent = await this.fileService.getContents(this.tocFilePath);
    return parse(tocContent) as Toc;
  }

  public async save(contents: string) {
    await this.fileService.ensurePathExists(this.tocFilePath);
    await this.fileService.writeContents(this.tocFilePath, contents);
    return this.tocPath;
  }
}
