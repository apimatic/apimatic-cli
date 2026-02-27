import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { ActionResult } from "../action-result.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { Language } from "../../types/sdk/generate.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import git from "isomorphic-git";
import * as fsSync from "fs";
import * as path from "path";
import * as fsPromises from "fs/promises";
import { BuildContext } from "../../types/build-context.js";

const GIT_AUTHOR = { name: "APIMatic-bot", email: "developer@apimatic.io" } as const;
const CUSTOM_BRANCH = "custom-code";
const MAIN_BRANCH = "main";

export class SaveChangesAction {
  private readonly prompts = new SaveChangesPrompts();
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(
    private readonly configDir: DirectoryPath,
    private readonly commandMetadata: CommandMetadata
  ) {}

  public async execute(buildDirectory: DirectoryPath, updatedSdkDirectory: DirectoryPath, language: Language, force: boolean): Promise<ActionResult> {
    const buildContext = new BuildContext(buildDirectory);
        if (!(await buildContext.validate())) {
          this.prompts.srcDirectoryEmpty(buildDirectory);
          return ActionResult.failed();
        }

    if (!(await this.fileService.directoryExists(updatedSdkDirectory))) {
      this.prompts.invalidSdkDirectory(updatedSdkDirectory);
      return ActionResult.failed();
    }

    const sdkSourceTreeDir = buildDirectory.join("sdk-source-tree");
    const zipFilePath = path.join(sdkSourceTreeDir.toString(), `.${language}`);
    const existingZipFile = FilePath.create(zipFilePath);

    if (!existingZipFile || !(await this.fileService.fileExists(existingZipFile))) {
      this.prompts.sdkSourceTreeNotFound(language);
      return ActionResult.failed();
    }

    return withDirPath(async (tempDirectory) => {
      await this.zipService.unArchive(existingZipFile, tempDirectory);
      const tempDirStr = tempDirectory.toString();

      await this.checkoutToCustomBranch(tempDirStr);

      await this.fileService.copyDirectoryExcluding(updatedSdkDirectory, tempDirectory, [".git"]);

      const fileStatuses = await this.getModifiedFilesWithStatus(tempDirStr);

      if (fileStatuses.length === 0) {
        this.prompts.noChangesDetected();
        return ActionResult.success();
      }

      if (!force) {
        this.prompts.modifiedFilesDetected(language, fileStatuses);
        const shouldSave = await this.prompts.confirmSaveChanges();
        if (!shouldSave) {
          this.prompts.operationCancelled();
          return ActionResult.cancelled();
        }
      }

      // new added
      const modifiedFiles = fileStatuses.map(fs => fs.file);
      await this.normalizeLineEndings(tempDirStr, modifiedFiles);
      await this.stageChanges(tempDirStr, modifiedFiles);
      await git.commit({
        fs: fsSync,
        dir: tempDirStr,
        message: "add customizations",
        author: GIT_AUTHOR,
      });

      await git.checkout({ fs: fsSync, dir: tempDirStr, ref: MAIN_BRANCH });
      await this.zipService.archive(
        new DirectoryPath(path.join(tempDirStr, ".git")),
        FilePath.create(zipFilePath)!,
        ".git"
      );

      this.prompts.changesSaved();
      return ActionResult.success();
    });
  }

  private async checkoutToCustomBranch(dir: string): Promise<void> {
    const branches = await git.listBranches({ fs: fsSync, dir });

    if (!branches.includes(CUSTOM_BRANCH)) {
      await git.branch({ fs: fsSync, dir, ref: CUSTOM_BRANCH });
    }

    await git.checkout({ fs: fsSync, dir, ref: CUSTOM_BRANCH });
  }

  private async getModifiedFiles(dir: string): Promise<string[]> {
    const statusMatrix = await git.statusMatrix({ fs: fsSync, dir });

    return statusMatrix
      // If the working directory differs from HEAD then consider the file as modified
      .filter(([, headStatus, workdirStatus]) =>
        headStatus !== workdirStatus
      )
      .map(([filepath]) => filepath);
  }

  private async getModifiedFilesWithStatus(dir: string): Promise<Array<{ file: string; status: 'modified' | 'added' | 'deleted' }>> {
    const statusMatrix = await git.statusMatrix({ fs: fsSync, dir });

    return statusMatrix
      .filter(([, headStatus, workdirStatus]) => headStatus !== workdirStatus)
      .map(([filepath, headStatus, workdirStatus]) => {
        let status: 'modified' | 'added' | 'deleted';

        if (workdirStatus === 0) {
          // File is gone from working directory
          status = 'added';
        } else if (headStatus === 0) {
          // File didn't exist in HEAD
          status = 'deleted';
        } else {
          // File existed in HEAD and still exists, but differs
          status = 'modified';
        }

        return { file: filepath, status };
      });
  }

  private async normalizeLineEndings(dir: string, modifiedFiles: string[]): Promise<void> {
    await Promise.all(
      modifiedFiles.map(async (filepath) => {
        const fullPath = path.join(dir, filepath);
        try {
          const content = await fsPromises.readFile(fullPath, 'utf8');
          const normalized = content.replace(/\r\n/g, '\n'); // Convert CRLF to LF
          await fsPromises.writeFile(fullPath, normalized, 'utf8');
        } catch {
          // Skip binary files or files that can't be read as text
        }
      })
    );
  }

  private async stageChanges(dir: string, modifiedFiles: string[]): Promise<void> {
    await Promise.all(
      modifiedFiles.map(async (filepath) => {
        const fullPath = path.join(dir, filepath);
        return fsSync.existsSync(fullPath)
          ? git.add({ fs: fsSync, dir, filepath })
          : git.remove({ fs: fsSync, dir, filepath });
      })
    );
  }
}