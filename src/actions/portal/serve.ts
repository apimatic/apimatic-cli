import path from "path";
import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeFlags, ServePaths } from "../../types/portal/serve.js";
import { PortalServerService } from "../../services/portal/server.js";
import { Result } from "../../types/common/result.js";

export class PortalServeAction {
  private readonly prompts: PortalServePrompts;
  private readonly serverService: PortalServerService;

  public constructor() {
    this.prompts = new PortalServePrompts();
    this.serverService = new PortalServerService();
  }

  public async servePortal(flags: ServeFlags, paths: ServePaths): Promise<Result<string, string>> {
    const serverService = new PortalServerService();
    const ignoredPaths = [
      ...flags.ignore.split(",").map((path) => path.trim()),
      ...this.getGeneratedFilesPaths(flags.folder, flags.destination)
    ];

    try {
      this.prompts.displayGeneratingPortalMessage();
      await generatePortal(sourceDir, portalDir, this.config.configDir, allIgnoredPaths, overrideAuthKey);
      this.prompts.displayGeneratedPortalMessage(portalDir);
      await cleanUpGeneratedPortalFiles(sourceDir);
    } catch (error) {
      this.prompts.displayGeneratingPortalErrorMessage();
      await cleanUpGeneratedPortalFiles(sourceDir);
      this.handleError(error);
    }

    serverService.setupServer(portalDir);

    serverService.startServer(
      {
        generatedPortalPath: portalDir,
        targetFolder: sourceDir,
        configDir: this.config.configDir,
        authKey: overrideAuthKey,
        ignoredPaths: allIgnoredPaths,
        port,
        openInBrowser: flags.open
      },
      flags["no-reload"]
    );

    this.prompts.displayOutroMessage(port);
  }

  private getGeneratedFilesPaths(sourceDirectoryPath: string, generatedPortalArtifactsDirectoryPath: string): string[] {
    const generatedBuildInputZipPath = path.join(sourceDirectoryPath, ".portal_source.zip");
    const generatedPortalArtifactsZipFilePath = path.join(sourceDirectoryPath, ".generated_portal.zip");
    const generatedPortalArtifactsFolderPath = path.join(
      path.dirname(generatedPortalArtifactsDirectoryPath),
      "generated_portal"
    );

    return [generatedBuildInputZipPath, generatedPortalArtifactsFolderPath, generatedPortalArtifactsZipFilePath];
  }

  private handleError(error: unknown) {
    if (axios.isAxiosError(error)) {
      const axiosError = error;
      if (axiosError.response) {
        if (axiosError.response.status === 400) {
          this.error(
            getMessageInRedColor(
              `Failed to generate the portal. Please ensure that the provided build directory follows the correct structure and contains valid API definition and build files.`
            )
          );
        } else if (axiosError.response.status === 401) {
          this.error(
            getMessageInRedColor(
              `Failed to generate the portal. Please ensure that you are logged in or have provided a valid Auth key.`
            )
          );
        } else if (axiosError.response.status === 403) {
          this.error(
            getMessageInRedColor(
              `Access denied. It looks like you don't have access to APIMatic's Docs as Code offering. Check your subscription details and contact our team at support@apimatic.io if you believe this is a mistake.`
            )
          );
        } else if (axiosError.response.status === 422) {
          this.error(
            getMessageInRedColor(
              `Failed to generate the portal. Please ensure that the provided build directory follows the correct structure and contains valid API definition and build files.`
            )
          );
        } else if (axiosError.response.status === 500) {
          this.error(
            getMessageInRedColor(
              `Failed to generate the portal. Please ensure that the provided build directory follows the correct structure and contains valid API definition and build files. If the issue persists, reach out to our team at support@apimatic.io`
            )
          );
        } else {
          this.error(
            getMessageInRedColor(
              `Failed to generate the portal. Please ensure that the provided build directory follows the correct structure and contains valid API definition and build files. If the issue persists, reach out to our team at support@apimatic.io`
            )
          );
        }
      } else if (axiosError.request) {
        if (axiosError.code === "ECONNABORTED") {
          this.error(
            getMessageInRedColor(
              `Your request timed out. Please try again or reach out to our team at support@apimatic.io for help if your problem persists.`
            )
          );
        } else if (error.code === "ENOTFOUND" || error.code === "ERR_NETWORK") {
          this.error(getMessageInRedColor(`Network error. Please check your internet connection and try again.`));
        } else {
          this.error(getMessageInRedColor(`No response received from the server. Please try again later.`));
        }
      } else {
        this.error(getMessageInRedColor(`Failed to generate the portal: ${axiosError.message}`));
      }
    } else if (error instanceof Error) {
      this.error(getMessageInRedColor(`Failed to generate the portal: ${error.message}`));
    } else {
      this.error(
        getMessageInRedColor(
          `Something went wrong while generating the portal, please try again later. If the issue persists, contact our team at support@apimatic.io`
        )
      );
    }
  }
}
