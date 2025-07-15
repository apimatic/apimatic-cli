import { simpleGit } from "simple-git";
import axios from "axios";
import * as path from "path";
import filetype from "file-type";
import fs from "fs";
import fsExtra from "fs-extra";
import { readdir } from "fs/promises";
import { getAuthInfo } from "../../client-utils/auth-manager.js";
import { ApiError, ApiValidationExternalApisController, ApiValidationSummary } from "@apimatic/sdk";
import { LoginCredentials, SpecFile } from "../../types/portal/quickstart.js";
import { SDKClient } from "../../client-utils/sdk-client.js";
import {
  createTempDirectory,
  isValidUrl,
  unzipFile,
  getMessageInRedColor,
  clearDirectory,
  deleteFile,
  validateAndZipPortalSource,
  extractZipFile
} from "../../utils/utils.js";
import { getValidationSummary } from "../api/validate.js";
import { AuthorizationError, GetValidationParams } from "../../types/api/validate.js";
import { metadataFileContent, staticPortalRepoUrl } from "../../config/env.js";
import { ServeHandler } from "../../application/portal/serve/serve-handler.js";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { AuthenticationError } from "../../types/utils.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { PortalService } from "../../infrastructure/services/portal-service.js";
import { GeneratePortalParams } from "../../types/portal/generate.js";
import { Result } from "../../types/common/result.js";

export class PortalQuickstartController {
  private readonly specUrl =
    "https://github.com/apimatic/static-portal-workflow/blob/master/spec/Apimatic-Calculator.json";
  private readonly GENERATED_PORTAL_ARTIFACTS_ZIP_FILENAME = ".generated_portal.zip";
  private readonly GENERATED_BUILD_INPUT_ZIP_FILENAME = ".portal_source.zip";

  async isUserAuthenticated(configDir: string): Promise<boolean> {
    const storedAuth = await getAuthInfo(configDir);
    if (!storedAuth?.authKey) {
      return false;
    }
    return true;
  }

  async userLogin(credentials: LoginCredentials, client: SDKClient, configDir: string): Promise<void> {
    await client.login(credentials.email, credentials.password, configDir);
  }

  async getSpecFile(spec: string): Promise<SpecFile> {
    const tempSpecDir = await createTempDirectory();

    if (spec) {
      let specPath = String(spec);

      if (isValidUrl(specPath)) {
        try {
          const response = await axios.head(specPath);

          if (response.headers["content-type"].includes("text/html")) {
            throw new Error(
              getMessageInRedColor(
                `Invalid URL. Please check the URL and ensure it points to a valid OpenAPI definition.`
              )
            );
          }

          const specFile = await axios.get(specPath, { responseType: "arraybuffer" });
          const fileName = path.basename(specPath);
          const filePath = path.join(tempSpecDir, fileName);
          await fsExtra.writeFile(filePath, specFile.data);
        } catch (error) {
          if (axios.isAxiosError(error)) {
            if (error.response) {
              if (error.response.status === 404) {
                throw new Error(
                  getMessageInRedColor(
                    `Unable to download the API Definition. The server returned a 404 Not Found error. Please verify that the provided URL is correct and publicly accessible.`
                  )
                );
              } else {
                throw new Error(
                  getMessageInRedColor(
                    `Unable to download the API Definition. The server returned ${error.response.status} ${error.response.statusText}`
                  )
                );
              }
            } else if (error.request) {
              if (error.code === "ECONNABORTED") {
                throw new Error(
                  getMessageInRedColor(
                    `Unable to download the API Definition, your request timed out. Please check your internet connection and try again, or contact APIMatic support for help if your problem persists.`
                  )
                );
              } else if (error.code === "ENOTFOUND" || error.code === "ERR_NETWORK") {
                throw new Error(
                  getMessageInRedColor(
                    `Failed to download the API Definition file due to network issues. Please check your internet connection and try again.`
                  )
                );
              } else {
                throw new Error(
                  getMessageInRedColor(
                    `Failed to download the API Definition file, no response was received from the server. Please try again later.`
                  )
                );
              }
            } else {
              throw new Error(getMessageInRedColor(`Failed to download API Definition: ${error.message}`));
            }
          } else {
            throw new Error(
              getMessageInRedColor(
                `Unable to save API Definition : ${error instanceof Error ? error.message : "Unknown error"}`
              )
            );
          }
        }
      } else {
        specPath = path.normalize(specPath);
        const fileType = await filetype.fromFile(specPath);

        if (fileType?.ext === "zip") {
          await unzipFile(fs.createReadStream(specPath), tempSpecDir);
        } else {
          const destinationPath = path.join(tempSpecDir, path.basename(specPath));
          await fsExtra.copy(specPath, destinationPath);
        }
      }
    }

    return { localPath: tempSpecDir, url: this.specUrl };
  }

  async getSpecValidationSummary(
    prompts: PortalQuickstartPrompts,
    specFile: SpecFile,
    apiValidationController: ApiValidationExternalApisController
  ): Promise<ApiValidationSummary> {
    const validationFlags: GetValidationParams = {
      file: specFile.localPath,
      url: specFile.url
    };

    try {
      const validationSummary = await getValidationSummary(validationFlags, apiValidationController);
      return validationSummary;
    } catch (error) {
      prompts.displaySpecValidationErrorMessage();
      if (axios.isAxiosError(error)) {
        if (error.response) {
          if (error.response.status === 400) {
            throw new Error(
              getMessageInRedColor(
                `The provided spec file is not valid. Please ensure that the spec you have provided is a valid API definition file.`
              )
            );
          } else if (error.response.status === 500) {
            throw new Error(
              getMessageInRedColor(
                `The server encountered an error while validating your spec file, please try again later. If the issue persists, contact our team at support@apimatic.io`
              )
            );
          } else {
            throw new Error(
              getMessageInRedColor(
                `Something went wrong while validating your spec file. The server returned the following error ${error.response.status} ${error.response.statusText}. Please try again later. If the issue persists, contact our team at support@apimatic.io`
              )
            );
          }
        } else if (error.request) {
          if (error.code === "ECONNABORTED") {
            throw new Error(getMessageInRedColor(`The spec validation request timed out. Please try again.`));
          } else if (error.code === "ENOTFOUND" || error.code === "ERR_NETWORK") {
            throw new Error(
              getMessageInRedColor(
                `Network error encountered while validating the spec file. Please check your connection and try again.`
              )
            );
          } else {
            throw new Error(
              getMessageInRedColor(
                `Something went wrong while validating the spec file, please try again. If the issue persists, reach out to our support team at support@apimatic.io`
              )
            );
          }
        } else {
          throw new Error(getMessageInRedColor(`Failed to validate spec file: ${error.message}`));
        }
      } else if ((error as ApiError).result) {
        const apiError = error as ApiError;
        if ((error as AuthorizationError).body && apiError.statusCode === 401) {
          throw new Error("You are not authorized to perform this action.");
        } else {
          throw new Error((error as Error).message);
        }
      } else if ((error as AuthenticationError).statusCode === 401) {
        throw new Error("You are not authorized to perform this action.");
      } else if (
        (error as AuthenticationError).statusCode === 402 &&
        (error as AuthenticationError).body &&
        typeof (error as AuthenticationError).body === "string"
      ) {
        throw new Error((error as AuthenticationError).body);
      } else {
        throw new Error(
          getMessageInRedColor(
            `Something went wrong while validating the spec file, please try again later. If the issue persists, contact our team at support@apimatic.io`
          )
        );
      }
    }
  }

  async setupBuildDirectory(
    prompts: PortalQuickstartPrompts,
    targetFolder: string,
    specFile: SpecFile,
    validationSummary: ApiValidationSummary,
    languages: string[]
  ): Promise<void> {
    const git = simpleGit({
      timeout: {
        block: 60 * 1000 // 1 minute timeout.
      }
    });

    fsExtra.emptyDirSync(targetFolder);

    try {
      await git.clone(staticPortalRepoUrl, targetFolder);
    } catch (error) {
      prompts.displayBuildDirectoryGenerationErrorMessage();
      if (error instanceof Error) {
        if (error.message.includes("timed out")) {
          throw new Error(
            getMessageInRedColor(
              "The operation timed out while setting up the build directory. Please check your internet connection and try again."
            )
          );
        } else if (error.message.includes("Could not resolve host")) {
          throw new Error(
            getMessageInRedColor("Unable to resolve the host. Please check your network settings and try again.")
          );
        } else {
          throw new Error(getMessageInRedColor(`Failed to set up the build directory. ${error.message}`));
        }
      } else {
        throw new Error(getMessageInRedColor(`Failed to set up the build directory. ${error}`));
      }
    }

    await clearDirectory(path.join(targetFolder, ".git"));
    await clearDirectory(path.join(targetFolder, ".github"));

    if (specFile.localPath && validationSummary.success) {
      const specFolder = path.join(targetFolder, "spec");
      await deleteFile(path.join(specFolder, "Apimatic-Calculator.json"));

      const files = await readdir(specFile.localPath);
      for (const file of files) {
        const srcPath = path.join(specFile.localPath, file);
        const destPath = path.join(specFolder, file);
        await fsExtra.copy(srcPath, destPath);
      }
    }

    const buildFilePath = path.join(targetFolder, "APIMATIC-BUILD.json");
    const buildFileContent = JSON.parse(fs.readFileSync(buildFilePath, "utf8"));

    const languageConfig = languages.reduce((config, lang) => {
      config[lang] = {};
      return config;
    }, {} as { [key: string]: object });

    buildFileContent.generatePortal.languageConfig = languageConfig;

    fs.writeFileSync(buildFilePath, JSON.stringify(buildFileContent, null, 2));

    const specFolder = path.join(targetFolder, "spec");

    const metadataFile = fs.readdirSync(specFolder).find((file) => file.startsWith("APIMATIC-META"));

    if (!metadataFile) {
      const newMetadataFilePath = path.join(specFolder, "APIMATIC-META.json");
      fs.writeFileSync(newMetadataFilePath, JSON.stringify(metadataFileContent, null, 2));
    }
  }

  async generatePortalArtifacts(sourceDirectoryPath: string, configDir: string): Promise<string> {
    const generatedPortalPath = path.join(sourceDirectoryPath, "generated_portal");
    const generatedPortalZipFilePath = path.join(sourceDirectoryPath, ".generated_portal.zip");
    const docsPortalService = new PortalService();

    const sourceBuildInputZipFilePath = await validateAndZipPortalSource(sourceDirectoryPath, generatedPortalPath);

    //TODO: Remove usage of empty string and null.
    const generatePortalParams: GeneratePortalParams = {
      sourceBuildInputZipFilePath: sourceBuildInputZipFilePath,
      generatedPortalArtifactsFolderPath: generatedPortalPath,
      generatedPortalArtifactsZipFilePath: "",
      generateZipFile: false,
      overrideAuthKey: null
    };

    const generateOnPremPortalResult = await docsPortalService.generateOnPremPortal(generatePortalParams, configDir);
    await deleteFile(sourceBuildInputZipFilePath);
    if (generateOnPremPortalResult.isFailed()) {
      throw new Error(getMessageInRedColor(generateOnPremPortalResult.error!));
    }

    await this.saveGeneratedPortalStreamToZipFile(
      generateOnPremPortalResult.value!, 
      generatedPortalZipFilePath
    );

    await extractZipFile(generatedPortalZipFilePath, generatedPortalPath);
    await deleteFile(generatedPortalZipFilePath);

    return generatedPortalPath;
  }

  async servePortal(generatedPortalPath: string, sourceDirectoryPath: string, configDir: string): Promise<boolean> {
    const server = new ServeHandler();

    await server.setupServer(generatedPortalPath);

    await this.cleanUpGeneratedPortalFiles(sourceDirectoryPath);

    const result = await server.startServer(
      {
        sourceDirectoryPath: sourceDirectoryPath,
        destinationDirectoryPath: generatedPortalPath,
        generatedPortalArtifactsDirectoryPath: generatedPortalPath
      } as ServePaths,
      {
        folder: sourceDirectoryPath,
        destination: generatedPortalPath,
        port: 3000,
        open: false,
        "no-reload": false,
        "auth-key": "",
        ignore: ""
      } as ServeFlags,
      [],
      configDir
    );

    return result.isSuccess();
  }

  private async cleanUpGeneratedPortalFiles(sourceDirectoryPath: string) {
    const generatedPortalArtifactsZipFilePath = path.join(
      sourceDirectoryPath,
      this.GENERATED_PORTAL_ARTIFACTS_ZIP_FILENAME
    );
    const generatedPortalBuildInputZipFilePath = path.join(
      sourceDirectoryPath,
      this.GENERATED_BUILD_INPUT_ZIP_FILENAME
    );
    if (fs.existsSync(generatedPortalArtifactsZipFilePath)) {
      await deleteFile(generatedPortalArtifactsZipFilePath);
    }
    if (fs.existsSync(generatedPortalBuildInputZipFilePath)) {
      await deleteFile(generatedPortalBuildInputZipFilePath);
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
        .on("error", (error) => reject(Result.failure(`Failed to save downloaded portal to file: ${error.message}`)));
    });
  }
}
