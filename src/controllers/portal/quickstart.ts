import axios from "axios";
import * as path from "path";
import filetype from "file-type";
import fs from "fs";
import fsExtra from "fs-extra";
import { readdir } from "fs/promises";
import { getAuthInfo } from "../../client-utils/auth-manager.js";
import { ApiError, ApiValidationExternalApisController, ApiValidationSummary } from "@apimatic/sdk";
import { SpecFile } from "../../types/portal/quickstart.js";
import {
  createTempDirectory,
  isValidUrl,
  getMessageInRedColor,
  clearDirectory,
  deleteFile
} from "../../utils/utils.js";
import { getValidationSummary } from "../api/validate.js";
import { AuthorizationError, GetValidationParams } from "../../types/api/validate.js";
import { metadataFileContent } from "../../config/env.js";
import { PortalQuickstartPrompts } from "../../prompts/portal/quickstart.js";
import { AuthenticationError } from "../../types/utils.js";
import { ZipService } from "../../infrastructure/zip-service.js";
import { FilePath } from "../../types/file/filePath.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileName } from "../../types/file/fileName.js";
import { withDirPath } from "../../infrastructure/tmp-extensions.js";
import { FileService } from "../../infrastructure/file-service.js";

export class PortalQuickstartController {
  private readonly zipService = new ZipService();
  private readonly fileService = new FileService();
  private readonly specUrl = "https://github.com/apimatic/static-portal-workflow/blob/master/spec/openapi.json";

  async isUserAuthenticated(configDir: string): Promise<boolean> {
    const storedAuth = await getAuthInfo(configDir);
    if (!storedAuth?.authKey) {
      return false;
    }
    return true;
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
          await this.zipService.unArchive(
            new FilePath(new DirectoryPath(path.dirname(specPath)), new FileName(path.basename(specPath))),
            new DirectoryPath(tempSpecDir)
          );
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

  private async downloadRepositoryFromGitHub(targetFolder: string): Promise<void> {
    return await withDirPath(async (tempDirectory) => {
      const zipUrl = `https://github.com/apimatic/static-portal-workflow/archive/refs/heads/master.zip`;
      const response = await fetch(zipUrl);
      const repositoryFolderName = "static-portal-workflow-master";

      if (!response.ok) {
        throw new Error(`Unable to setup your portal, please try again later.`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const tempZipPath = new FilePath(tempDirectory, new FileName("static-repo.zip"));
      await this.fileService.writeBuffer(tempZipPath, Buffer.from(arrayBuffer));

      await this.zipService.unArchive(tempZipPath, tempDirectory);

      const extractedFolderPath = new DirectoryPath(tempDirectory.toString(), repositoryFolderName);
      await this.fileService.copyDirectoryContents(extractedFolderPath, new DirectoryPath(targetFolder));
    });
  }

  async setupBuildDirectory(
    prompts: PortalQuickstartPrompts,
    targetFolder: string,
    specFile: SpecFile,
    validationSummary: ApiValidationSummary,
    languages: string[]
  ): Promise<void> {
    fsExtra.emptyDirSync(targetFolder);

    try {
      await this.downloadRepositoryFromGitHub(targetFolder);
    } catch (error) {
      prompts.displayBuildDirectoryGenerationErrorMessage();
      if (error instanceof Error) {
        if (error.message.includes("timed out") || error.message.includes("timeout")) {
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

    await clearDirectory(path.join(targetFolder, ".github"));

    if (specFile.localPath && validationSummary.success) {
      const specFolder = path.join(targetFolder, "spec");
      await deleteFile(path.join(specFolder, "openapi.json"));

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
}
