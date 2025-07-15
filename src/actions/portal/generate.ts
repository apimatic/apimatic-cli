import * as path from "path";
import fsExtra from "fs-extra";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { PortalPaths, GeneratePortalParams, GenerateFlags } from "../../types/portal/generate.js";
import { Result } from "../../types/common/result.js";
import {
  validateAndZipPortalSource,
  deleteFile,
  extractZipFile,
  getMessageInRedColor
} from "../../utils/utils.js";
import { PortalGeneratePrompts } from "../../prompts/portal/generate.js";

export class PortalGenerateAction {
  private readonly prompts: PortalGeneratePrompts;
  private readonly GENERATED_PORTAL_ARTIFACTS_ZIP_FILENAME = ".generated_portal.zip";
  private readonly GENERATED_BUILD_INPUT_ZIP_FILENAME = ".portal_source.zip";

  constructor() {
    this.prompts = new PortalGeneratePrompts();
  }

  async generatePortal(paths: PortalPaths, flags: GenerateFlags, configDir: string): Promise<void> {
    this.prompts.displayPortalGenerationMessage();
    const pathsToIgnore = this.getGeneratedFilesPaths(paths.sourceFolderPath, paths.generatedPortalArtifactsFolderPath);

    //TODO: Refactor this method, carries dual responsibility.
    const sourceBuildInputZipFilePath = await validateAndZipPortalSource(
      paths.sourceFolderPath,
      path.join(paths.sourceFolderPath, ".portal_source.zip"),
      pathsToIgnore
    );

    const generatePortalParams: GeneratePortalParams = {
      sourceBuildInputZipFilePath: sourceBuildInputZipFilePath,
      generatedPortalArtifactsFolderPath: paths.generatedPortalArtifactsFolderPath,
      generatedPortalArtifactsZipFilePath: paths.generatedPortalArtifactsZipFilePath,
      overrideAuthKey: flags["auth-key"] ?? null,
      generateZipFile: flags.zip
    };

    const docsPortalService = new PortalService();
    const portalGenerationResult = await docsPortalService.generateOnPremPortal(generatePortalParams, configDir);
    await deleteFile(sourceBuildInputZipFilePath);

    if (portalGenerationResult.isSuccess()) {
      await this.saveGeneratedPortalStreamToZipFile(
        portalGenerationResult.value!,
        paths.generatedPortalArtifactsZipFilePath
      );

      if (flags.zip) {
        this.prompts.displayPortalGenerationSuccessMessage();
        this.prompts.displayOutroMessage(paths.generatedPortalArtifactsZipFilePath);
        return;
      }

      await extractZipFile(paths.generatedPortalArtifactsZipFilePath, paths.generatedPortalArtifactsFolderPath);
      await deleteFile(paths.generatedPortalArtifactsZipFilePath);

      this.prompts.displayPortalGenerationSuccessMessage();
      this.prompts.displayOutroMessage(paths.generatedPortalArtifactsFolderPath);
    } else {
      this.prompts.displayPortalGenerationErrorMessage();
      this.prompts.logError(getMessageInRedColor(`${portalGenerationResult.error!}`));
    }
  }

  private async saveGeneratedPortalStreamToZipFile(
    data: NodeJS.ReadableStream,
    generatedPortalArtifactsZipFilePath: string
  ): Promise<void> {
    const writeStream = fsExtra.createWriteStream(generatedPortalArtifactsZipFilePath);
    await new Promise<void>((resolve, reject) => {
      data
        .pipe(writeStream)
        .on("finish", () => resolve())
        .on("error", () => reject(new Error(`An unexpected error occurred while generating the portal. Please try again later. If the issue persists, contact our team at support@apimatic.io`)));
    });
  }

  private getGeneratedFilesPaths(sourceDirectoryPath: string, generatedPortalArtifactsDirectoryPath: string): string[] {
    const generatedBuildInputZipPath = path.join(sourceDirectoryPath, this.GENERATED_BUILD_INPUT_ZIP_FILENAME);
    const generatedPortalArtifactsZipFilePath = path.join(sourceDirectoryPath, this.GENERATED_PORTAL_ARTIFACTS_ZIP_FILENAME);

    return [generatedBuildInputZipPath, generatedPortalArtifactsDirectoryPath, generatedPortalArtifactsZipFilePath];
  }
}
