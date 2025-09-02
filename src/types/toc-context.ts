import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { err, ok, Result } from "neverthrow";
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

  // TODO: Sohail create validate method and read directly

  public async parseTocData(): Promise<Result<Toc, string>> {
    // Check if the file exists
    if (!fs.existsSync(this.tocFilePath.toString())) {
      return err(
        `toc.yml file not found at ${this.tocFilePath}. Please run 'apimatic:toc:new' to create your toc.yml file first.`
      );
    }

    try {
      const tocContent = await fs.promises.readFile(
        this.tocFilePath.toString(),
        "utf-8"
      );
      const parsedToc = parse(tocContent) as Toc;
      return ok(parsedToc);
    } catch {
      return err(
        `Unable to parse the toc.yml file located at ${this.tocFilePath}. Please make sure that the toc.yml is a valid YAML file.`
      );
    }
  }

  public async save(contents: string) {
    await this.fileService.ensurePathExists(this.tocFilePath);
    await this.fileService.writeContents(this.tocFilePath, contents);
    return this.tocPath;
  }
}
