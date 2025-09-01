import * as path from "path";
import fs from "fs";
import axios from "axios";
import treeify from "treeify";
import { Result } from "neverthrow";
import { text, select, multiselect, log, isCancel, spinner, note } from "@clack/prompts";
import { getMessageInGreenColor, getMessageInRedColor } from "../../utils/utils.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { format as f, withSpinner } from "../format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { FileService } from "../../infrastructure/file-service.js";
import { removeQuotes } from "../../utils/string-utils.js";
import { getErrorMessage, ServiceError } from "../../infrastructure/api-utils.js";

const vscodeExtensionUrl =
  "https://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode";
const referenceDocumentationUrl = "https://docs.apimatic.io/cli-getting-started/advanced-portal-setup";
const defaultPortalDirectoryPath = process.cwd();

const descriptions: { [key: string]: string } = Object.entries({
  "APIMATIC-BUILD.json": "# Defines all configurations for the API portal, including programming languages and themes",
  spec: "# Contains all API definition files",
  content: "# Includes custom documentation pages in Markdown",
  "content/toc.yml": "# Controls the structure of the side navigation bar in the API portal",
  static: "# Includes all static files, such as images, GIFs, and PDFs"
}).reduce((acc, [key, value]) => {
  acc[path.normalize(key)] = value;
  return acc;
}, {} as { [key: string]: string });

export class PortalQuickstartPrompts {
  private readonly fileService = new FileService();
  // TODO: Remove after refactoring validate action.
  private readonly spin = spinner();

  public welcomeMessage() {
    log.info(`Hello there.`);
    log.message(
      `This wizard will help you set up an API Portal via APIMatic's Docs as Code workflow in 4 simple steps.`
    );
    log.message(`Let's get started!`);
  }

  public importSpecStep() {
    const message = `Step 1 of 4: Import your OpenAPI Definition`;
    log.step(message);
  }

  // TODO: Very complex validation, needs to be improved.
  public async specPathPrompt(defaultSpecUrl: UrlPath): Promise<string | null> {
    while (true) {
      const spec = await text({
        message: `Provide a local path or a public URL for your OpenAPI definition file:`,
        placeholder: "Provide absolute URL/local path or press Enter to use a sample OpenAPI file from APIMatic.",
        defaultValue: defaultSpecUrl.toString(),
        validate: (input) => {
          if (!input) return;

          const cleanedPath = removeQuotes(input.trim() ?? "");

          if (!UrlPath.create(cleanedPath)) {
            const dirPath = path.resolve(cleanedPath);

            if (!fs.existsSync(dirPath)) {
              return "The specified file does not exist. Please enter a valid file path.";
            }

            if (!fs.statSync(dirPath).isFile()) {
              return "The specified path does not point to a valid API Definition file or a zip archive containing API definition files. Please try again.";
            }
          }

          return; // pass sync validation
        }
      });

      if (isCancel(spec)) {
        return null;
      }

      const cleanedPath = removeQuotes(String(spec).trim());

      // Async validation for URLs
      if (UrlPath.create(cleanedPath)) {
        try {
          const response = await axios.head(cleanedPath);
          const contentType = response.headers["content-type"];

          if (contentType?.includes("text/html")) {
            log.error(`Invalid URL. Please check the URL and ensure it points to a valid OpenAPI definition.`);
            continue; // re-prompt
          }
        } catch {
          log.error(`Failed to reach the URL. Please check your internet connection or the URL.`);
          continue; // re-prompt
        }
      }

      return cleanedPath; // valid local file or valid URL
    }
  }

  public specImportError(error: string) {
    log.error(error);
  }

  public specValidationError(error: string) {
    log.error(error);
  }

  public async useDefaultSpecPrompt(): Promise<boolean> {
    const useDefaultSpec = await select({
      message: `How would you like to proceed?`,
      options: [
        {
          value: "no",
          label: `1. Fix the issues using APIMatic's interactive VS Code Extension: ${vscodeExtensionUrl}`
        },
        { value: "yes", label: `2. Use an example API spec instead (recommended)` }
      ]
    });

    if (isCancel(useDefaultSpec)) {
      return false;
    }

    return useDefaultSpec === "yes";
  }

  public fixYourSpec() {
    const message = `Good luck fixing your API definition! Feel free to run this command again once you're done.`;
    log.step(message);
  }

  public validateSpecStep() {
    const message = `Step 2 of 4: Validate and Lint your OpenAPI file`;
    log.step(message);
  }

  public selectLanguagesStep() {
    const message = `Step 3 of 4: Select programming languages`;
    log.step(message);
  }

  public async selectLanguagesPrompt(): Promise<string[] | null> {
    const languages = (await multiselect({
      message:
        "Your API Portal will contain SDKs and SDK Documentation in the following Languages. Press enter to continue with all languages, or use the arrow keys and spacebar to customize your selection:",
      options: [
        { label: "Typescript", value: "typescript" },
        { label: "Ruby", value: "ruby" },
        { label: "Python", value: "python" },
        { label: "Java", value: "java" },
        { label: "C#", value: "csharp" },
        { label: "PHP", value: "php" },
        { label: "Go", value: "go" }
      ],
      initialValues: ["typescript", "ruby", "python", "java", "csharp", "php", "go"],
      required: false,
    })) as string[];

    if (isCancel(languages)) {
      return null;
    }

    return ["http", ...languages];
  }

  public noLanguagesSelected() {
    log.error("Operation cancelled. No programming languages were selected.");
  }

  public selectInputDirectoryStep() {
    const message = `Step 4 of 4: Generate source files for Docs as Code`;
    log.step(message);
  }

  public async inputDirectoryPathPrompt(): Promise<DirectoryPath | undefined> {
    const directory = await text({
      message: "Enter the directory path where you would like to setup the API Portal (Requires an empty directory):",
      placeholder: "Provide absolute path to the directory or press Enter to use the current directory.",
      defaultValue: "./",
      validate: (input) => {
        const cleanedPath = removeQuotes(input?.trim() ?? "");

        if (!fs.existsSync(cleanedPath.toString()) && cleanedPath.toString() != defaultPortalDirectoryPath) {
          return getMessageInRedColor("Error: The specified directory path does not exist. Please try again.");
        }

        if (cleanedPath.toString() !== defaultPortalDirectoryPath) {
          const files = fs.readdirSync(cleanedPath.toString()).filter((item) => !item.startsWith("."));
          if (files.length > 0) {
            return getMessageInRedColor(
              "Error: The target directory is not empty. Please provide a path to an empty directory or clear its contents."
            );
          }
        } else if (fs.existsSync(cleanedPath.toString())) {
          // For ignoring hidden files and folders in the current directory in MacOS.
          const files = fs.readdirSync(cleanedPath.toString()).filter((item) => !item.startsWith("."));
          if (files.length > 0) {
            return getMessageInRedColor(
              "Error: The target directory is not empty. Please provide a path to an empty directory or clear its contents."
            );
          }
        }
      }
    });

    if (isCancel(directory)) {
      return undefined;
    }

    if (directory === "./") {
      return new DirectoryPath(defaultPortalDirectoryPath);
    } else {
      return new DirectoryPath(removeQuotes(directory as string).trim());
    }
  }

  public noInputDirectoryProvided() {
    log.error("No build directory was provided.");
  }

  public downloadBuildDirectory(fn: Promise<Result<NodeJS.ReadableStream, ServiceError>>) {
    return withSpinner(
      "Downloading Build directory",
      `Build directory downloaded successfully`,
      "Unable to download Build directory",
      fn
    );
  }

  public buildSetupError(serviceError: ServiceError) {
    log.error(getErrorMessage(serviceError));
  }

  public displayBuildDirectoryAsTree(buildDirectory: DirectoryPath): void {
    const structuredBuildDirectory = this.fileService.getDirectoryStructure(
      buildDirectory.toString(),
      descriptions
    ) as treeify.TreeObject;

    const tree = treeify.asTree(structuredBuildDirectory, true, true);

    const coloredLogString = tree
      .split("\n")
      .map((line) => line.replace(/#.*/, (match) => getMessageInGreenColor(match)))
      .join("\n");

    log.step(coloredLogString);
  }

  public nextSteps(): void {
    const message = `Use the API Playground or an SDK to call your API.
Customize the Portal theme, add API recipes and enable AI features
${f.link(referenceDocumentationUrl)}`;

    note(message, "Next steps");
  }

  serviceError(error: ServiceError) {
    log.error(getErrorMessage(error));
  }
}
