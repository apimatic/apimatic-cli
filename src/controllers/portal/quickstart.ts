import simpleGit, { SimpleGitOptions } from "simple-git";
import axios from "axios";
import * as path from "path";
import * as filetype from "file-type";
import * as fs from "fs";
import * as fsextra from "fs-extra";
import { getAuthInfo } from "../../client-utils/auth-manager";
import { APIValidationExternalApisController, ApiValidationSummary } from "@apimatic/sdk";
import { LoginCredentials, SpecFile } from "../../types/portal/quickstart";
import { SDKClient } from "../../client-utils/sdk-client";
import {
  createTempDirectory,
  isValidUrl,
  unzipFile,
  getMessageInRedColor,
  clearDirectory,
  deleteFile,
  cleanUpGeneratedPortalFiles
} from "../../utils/utils";
import { getValidation } from "../api/validate";
import { GetValidationParams } from "../../types/api/validate";
import { generatePortal } from "./serve";
import { metadataFileContent, staticPortalRepoUrl } from "../../config/env";
import { PortalServerService } from "../../services/portal/server";

export class PortalQuickstartController {
  private readonly specUrl = "https://github.com/apimatic/static-portal-workflow/blob/master/spec/Apimatic-Calculator.json";

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
    let filePath = "";
    const tempSpecDir = await createTempDirectory();

    if (spec) {
      let specPath = String(spec);

      if (isValidUrl(specPath)) {
        try {
          const response = await axios.head(specPath);

          if (response.headers["content-type"].includes("text/html")) {
            throw new Error(
              getMessageInRedColor(`Invalid URL entered, there is no file present at the URL specified.`)
            );
          }

          const specFile = await axios.get(specPath, { responseType: "arraybuffer" });
          const fileName = path.basename(specPath);
          filePath = path.join(tempSpecDir, fileName);
          await fsextra.writeFile(filePath, specFile.data);
        } catch (error) {
          if (axios.isAxiosError(error)) {
            if (error.response) {
              throw new Error(
                getMessageInRedColor(
                  `Failed to download spec: Server returned ${error.response.status} ${error.response.statusText}`
                )
              );
            } else if (error.request) {
              throw new Error(getMessageInRedColor(`Failed to download spec: Bad request.`));
            } else {
              throw new Error(getMessageInRedColor(`Failed to download spec: ${error.message}`));
            }
          } else {
            throw new Error(
              getMessageInRedColor(
                `Failed to save spec file: ${error instanceof Error ? error.message : "Unknown error"}`
              )
            );
          }
        }
      } else {
        specPath = path.normalize(specPath);
        const fileType = await filetype.fromFile(specPath);

        if (fileType?.ext === "zip") {
          filePath = tempSpecDir;
          await unzipFile(fs.createReadStream(specPath), tempSpecDir);
        } else {
          const destinationPath = path.join(tempSpecDir, path.basename(specPath));
          filePath = destinationPath;
          await fsextra.copy(specPath, destinationPath);
        }
      }
    }

    return { filePath, url: this.specUrl };
  }

  async getSpecValidationSummary(
    specFile: SpecFile,
    apiValidationController: APIValidationExternalApisController
  ): Promise<ApiValidationSummary> {
    const validationFlags: GetValidationParams = {
      file: specFile.filePath,
      url: specFile.url
    };

    return await getValidation(validationFlags, apiValidationController);
  }

  async setupBuildDirectory(
    targetFolder: string,
    specFile: SpecFile,
    validationSummary: ApiValidationSummary,
    languages: string[]
  ): Promise<void> {
    const options: Partial<SimpleGitOptions> = {
      timeout: {
        block: 60 * 1000 // 1 minute timeout.
      }
    };
    const git = simpleGit(options);

    try {
      await git.clone(staticPortalRepoUrl, targetFolder);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("timed out")) {
          throw new Error(
            getMessageInRedColor("The operation timed out. Please check your internet connection and try again.")
          );
        } else if (error.message.includes("Could not resolve host")) {
          throw new Error(
            getMessageInRedColor("Could not resolve host. Please check your internet connection and try again.")
          );
        } else {
          throw new Error(getMessageInRedColor(`There was an error setting up the build directory: ${error.message}`));
        }
      } else {
        throw new Error(
          getMessageInRedColor(`An unknown error occurred while setting up the build directory. ${error}`)
        );
      }
    }

    await clearDirectory(path.join(targetFolder, ".git"));
    await clearDirectory(path.join(targetFolder, ".github"));

    if (specFile.filePath && validationSummary.success) {
      await deleteFile(path.join(targetFolder, "spec", "Apimatic-Calculator.json"));
      fsextra.copy(specFile.filePath, path.join(targetFolder, "spec", path.basename(specFile.filePath)));
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

  async generatePortalArtifacts(targetFolder: string, configDir: string): Promise<string> {
    const generatedPortalPath = path.join(targetFolder, "api-portal");

    try {
      await generatePortal(targetFolder, generatedPortalPath, configDir);
      return generatedPortalPath;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") {
          throw new Error(
            getMessageInRedColor(
              `Your request timed out. Please try again or contact APIMatic support for help if your problem persists.`
            )
          );
        } else if (error.code === "ENOTFOUND") {
          throw new Error(getMessageInRedColor(`Network error. Please check your internet connection and try again.`));
        } else if (error.response) {
          if (error.response.status == 400) {
            throw new Error(
              getMessageInRedColor(
                `Failed to generate portal: Either the build file is missing or the build file was not a valid zip archive.`
              )
            );
          } else if (error.response.status == 403) {
            throw new Error(getMessageInRedColor(`Failed to generate portal: Please check your subscription details.`));
          } else if (error.response.status == 422) {
            throw new Error(
              getMessageInRedColor(
                `Failed to generate the portal: We ran into a problem while processing your build input. Please check if your build input is setup correctly.`
              )
            );
          } else if (error.response.status == 500) {
            throw new Error(
              getMessageInRedColor(`Failed to generate the portal: Please verify if your build input is valid.`)
            );
          } else {
            throw new Error(
              getMessageInRedColor(
                `Failed to generate portal: Server returned ${error.response.status} ${error.response.statusText}`
              )
            );
          }
        } else if (error.request) {
          throw new Error(getMessageInRedColor(`Failed to generate portal: Bad request.`));
        } else {
          throw new Error(getMessageInRedColor(`Failed to generate portal: ${error.message}`));
        }
      } else {
        throw new Error(getMessageInRedColor(`Something went wrong while generating the portal artifacts: ${error}`));
      }
    }
  }

  async servePortal(generatedPortalPath: string, targetFolder: string, configDir: string): Promise<void> {
    const server = new PortalServerService();

    server.setupServer(generatedPortalPath);

    server.startServer(
      {
        generatedPortalPath,
        targetFolder,
        configDir,
        authKey: null
      },
      false,
      false
    );

    await cleanUpGeneratedPortalFiles(targetFolder);
  }
}
