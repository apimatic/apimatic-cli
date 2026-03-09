import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FilePath } from "../../types/file/filePath.js";
import { ActionResult } from "../action-result.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { FileService } from "../../infrastructure/file-service.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { Language } from "../../types/sdk/generate.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { SaveChangesPrompts } from "../../prompts/sdk/save-changes.js";
import { LauncherService } from "../../infrastructure/launcher-service.js";
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
  private readonly launcherService = new LauncherService();

  constructor(
    private readonly configDir: DirectoryPath,
    private readonly commandMetadata: CommandMetadata
  ) {}

  public async execute(buildDirectory: DirectoryPath, updatedSdkDirectory: DirectoryPath, language: Language): Promise<ActionResult> {
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
      this.prompts.sdkSourceTreeNotFound(language, buildDirectory);
      return ActionResult.failed();
    }

    return withDirPath(async (tempDirectory) => {
      await this.zipService.unArchive(existingZipFile, tempDirectory);
      const tempDirStr = tempDirectory.toString();

      await this.checkoutToCustomBranch(tempDirStr);

      await this.fileService.copyDirectoryExcluding(updatedSdkDirectory, tempDirectory, [".git"]);

      const allFiles = await this.getAllTrackedFiles(tempDirStr);
      await this.normalizeLineEndings(tempDirStr, allFiles);

      const fileStatuses = await this.getModifiedFilesWithStatus(tempDirStr);

      if (fileStatuses.length === 0) {
        this.prompts.noChangesDetected();
        return ActionResult.success();
      }

      this.prompts.modifiedFilesDetected(language, fileStatuses);

      const reviewDir = path.join(tempDirStr, "review");
      await fsPromises.mkdir(reviewDir, { recursive: true });
      await fsPromises.cp(
        path.join(tempDirStr, ".git"),
        path.join(reviewDir, ".git"),
        { recursive: true }
      );
      await git.checkout({ fs: fsSync, dir: reviewDir, ref: CUSTOM_BRANCH, force: true });

      const diffPairs: Array<{ base: string; working: string }> = [];
      const standaloneFiles: string[] = [];
      for (const { file, status } of fileStatuses) {
        if (status === 'added') {
          standaloneFiles.push(path.join(updatedSdkDirectory.toString(), file));
        } else if (status === 'deleted') {
          const basePath = path.join(reviewDir, file);
          const { dir, name, ext } = path.parse(file);
          const deletedPath = path.join(reviewDir, dir, `${name} [deleted]${ext}`);
          await fsPromises.rename(basePath, deletedPath);
          standaloneFiles.push(deletedPath);
        } else {
          const basePath = path.join(reviewDir, file);
          const workingPath = path.join(updatedSdkDirectory.toString(), file);
          diffPairs.push({ base: basePath, working: workingPath });
        }
      }

      const hasFilesToOpen = diffPairs.length > 0 || standaloneFiles.length > 0;
      const opened = hasFilesToOpen
        ? await this.launcherService.openDiffsInSourceControl(updatedSdkDirectory, diffPairs, standaloneFiles)
        : false;

      if (opened) {
        this.prompts.reviewInIde();
      } else {
        this.prompts.ideOpenError();
      }

      const confirmed = await this.prompts.confirmSaveChanges();
      if (!confirmed) {
        this.prompts.operationCancelled();
        return ActionResult.cancelled();
      }

      await this.fileService.copyDirectoryExcluding(updatedSdkDirectory, tempDirectory, [".git"]);

      const latestStatuses = await this.getModifiedFilesWithStatus(tempDirStr);
      const allChangedFiles = latestStatuses.map(fs => fs.file);
      await this.stageChanges(tempDirStr, allChangedFiles);

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

  private async getModifiedFilesWithStatus(dir: string): Promise<Array<{ file: string; status: 'modified' | 'added' | 'deleted' }>> {
    const statusMatrix = await git.statusMatrix({ fs: fsSync, dir });

    return statusMatrix
      .filter(([, headStatus, workdirStatus]) => headStatus !== workdirStatus)
      .map(([filepath, headStatus, workdirStatus]) => {
        let status: 'modified' | 'added' | 'deleted';
        if (headStatus === 0) {
          status = 'added';
        } else if (workdirStatus === 0) {
          status = 'deleted';
        } else {
          status = 'modified';
        }
        return { file: filepath, status };
      });
  }

  private async getAllTrackedFiles(dir: string): Promise<string[]> {
    const statusMatrix = await git.statusMatrix({ fs: fsSync, dir });
    return statusMatrix.map(([filepath]) => filepath);
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