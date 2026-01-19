import { isCancel, confirm, log } from "@clack/prompts";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { format as f, getTree, TreeNode, LeafNode } from "../format.js";
import { Result } from "neverthrow";
import { FilePath } from "../../types/file/filePath.js";
import { ServiceError } from "../../infrastructure/service-error.js";
import { withSpinner } from "../prompt.js";

export class PortalGeneratePrompts {
  public async overwritePortal(directory: DirectoryPath): Promise<boolean> {
    const overwrite = await confirm({
      message: `The destination ${f.path(directory)} is not empty, do you want to overwrite?`,
      initialValue: false
    });

    if (isCancel(overwrite)) {
      return false;
    }

    return overwrite;
  }

  public directoryCannotBeSame(directory: DirectoryPath) {
    const message = `The ${f.var("src")} and ${f.var("portal")} directories must be different. Current value: ${f.path(
      directory
    )}`;
    log.error(message);
  }

  public srcDirectoryEmpty(directory: DirectoryPath) {
    const message = `The ${f.var("src")} directory is either empty or invalid: ${f.path(directory)}`;
    log.error(message);
  }

  public portalDirectoryNotEmpty() {
    const message = `Please enter a different destination folder or remove the existing files and try again.`;
    log.error(message);
  }

  public generatePortal(fn: Promise<Result<NodeJS.ReadableStream, ServiceError | NodeJS.ReadableStream>>, noCustomization: boolean = false) {
    return withSpinner("Generating portal", noCustomization ? "Portal generated successfully without customization." : "Portal files generated.", "Portal Generation failed.", fn);
  }

  public portalGenerationError(error: string) {
    log.error(error);
  }

  public portalGenerationServiceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public portalGenerationErrorWithReport(reportPath: FilePath) {
    const message = `An error occurred during portal generation.
A report has been written at the destination path ${f.path(reportPath)}`;
    log.error(message);
  }

  public portalGenerated(portal: DirectoryPath) {
    log.info(`Portal artifacts can be found at ${f.path(portal)}.`);
  }

  public conflictsFound(count: number) {
    log.message(`Found ${f.var(count.toString())} file(s) with conflicts that need to be resolved.`);
  }

  public conflictResolutionError(filePath: FilePath) {
    log.error(`Error opening file in editor: ${f.path(filePath)}`);
  }

  public listConflictFile(current: number, total: number, filePath: FilePath) {
    log.message(`  [${current}/${total}] ${f.path(filePath)}`);
  }

  public openingFolderInEditor(directory: DirectoryPath) {
    log.message(`Opening portal directory in VS Code: ${f.path(directory)}`);
    log.step("Please resolve the conflicts and save the files.");
  }

  public folderOpenedInEditor() {
    log.info("Portal directory opened in VS Code.");
  }

  public listSdkConflictFile(current: number, total: number, filePath: string) {
    log.message(`  [${current}/${total}] ${filePath}`);
  }

  public async askIfConflictsResolved(sdkName: string): Promise<boolean> {
    const resolved = await confirm({
      message: `Have you resolved all conflicts in ${f.var(sdkName)} SDK?`,
      initialValue: true
    });

    if (isCancel(resolved)) {
      return false;
    }

    return resolved;
  }

  public sdkOpenError(sdkName: string) {
    log.error(`Error opening ${sdkName} SDK in VS Code.`);
  }

  public conflictsStillPresent(unresolvedFiles: string[]) {
    log.error("Conflict markers are still present in the following files:");
    unresolvedFiles.forEach((file) => {
      log.error(`  - ${file}`);
    });
    log.message("Please resolve all conflict markers (<<<<<<<, =======, >>>>>>>) and try again.");
  }

  public updatingPatchFiles(sdkName: string, language: string) {
    log.info(`Updating patch files for ${f.var(sdkName)}`);
  }

  public patchFilesUpdated(sdkName: string) {
    log.info(`Patch files updated for ${f.var(sdkName)}`);
  }

  public displayMissingFiles(sdkName: string, missingFiles: string[]) {
    log.message(`These are the missing files for ${f.var(sdkName)}:`);
    missingFiles.forEach((file, index) => {
      log.message(`  [${index + 1}/${missingFiles.length}] ${file}`);
    });
    log.message('');
  }

  public displayFileTree(sdkName: string, conflictedFiles: string[], missingFiles: string[]) {
    log.message(`Conflicts found in ${f.var(sdkName)} SDK:`);
    const tree = this.buildFileTree(sdkName, conflictedFiles, missingFiles);
    log.message(tree);
  }

  private buildFileTree(sdkName: string, conflictedFiles: string[], missingFiles: string[]): string {

    // Build a nested tree structure from flat file paths
    const root: TreeNode = { name: sdkName, items: [] };

    const addFileToTree = (path: string, type: 'conflicted' | 'missing') => {
      const parts = path.split(/[\\/]/);
      let currentLevel = root.items;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;

        if (isLastPart) {
          // It's a file
          currentLevel.push({
            name: part,
            description: type === 'conflicted' ? '# Conflicted file' : '# Missing file'
          });
        } else {
          // It's a directory
          let existingDir = currentLevel.find((item: any) =>
            'items' in item && item.name === part
          ) as TreeNode | undefined;

          if (!existingDir) {
            existingDir = { name: part, items: [] };
            currentLevel.push(existingDir);
          }
          currentLevel = existingDir.items;
        }
      }
    };

    // Add all conflicted files
    conflictedFiles.forEach(file => addFileToTree(file, 'conflicted'));

    // Add all missing files
    missingFiles.forEach(file => addFileToTree(file, 'missing'));

    return getTree(root);
  }
}
