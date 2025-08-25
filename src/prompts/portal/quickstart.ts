import * as path from "path";
import fs from "fs";
import axios from "axios";
import treeify from "treeify";
import { text, select, multiselect, log, isCancel, cancel, spinner } from "@clack/prompts";
import { getMessageInGreenColor, getMessageInRedColor } from "../../utils/utils.js";
import { DirectoryNode } from "../../types/portal/quickstart.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { withSpinner } from "../format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { Result } from "neverthrow";

export class PortalQuickstartPrompts {
  private readonly vscodeExtensionUrl =
    "\u001b[4mhttps://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode\u001b[0m";
  private readonly serverUrl = "\u001b[4mhttp://localhost:3000\u001b[0m";
  private readonly referenceDocumentationUrl =
    "\u001b[4mhttps://docs.apimatic.io/cli-getting-started/advanced-portal-setup\u001b[0m";
  private readonly defaultPortalDirectoryPath = process.cwd();
  private readonly descriptions: { [key: string]: string } = Object.entries({
    "APIMATIC-BUILD.json":
      "# Defines all configurations for the API portal, including programming languages and themes",
    spec: "# Contains all API definition files",
    content: "# Includes custom documentation pages in Markdown",
    "content/toc.yml": "# Controls the structure of the side navigation bar in the API portal",
    static: "# Includes all static files, such as images, GIFs, and PDFs"
  }).reduce((acc, [key, value]) => {
    acc[path.normalize(key)] = value;
    return acc;
  }, {} as { [key: string]: string });

  // TODO: Remove after refactoring validate action.
  private readonly spin = spinner();

  public welcomeMessage() {
    log.message(`Hello there.`);
    log.message(
      `This wizard will help you set up an API Portal via APIMatic's Docs as Code workflow in 4 simple steps.`
    );
    log.message(`Let's get started!`);
  }

  public loginRequired() {
    const message = `You need to be logged in to continue.`;
    log.step(message);
  }

  public loginFailed() {
    const message = `Unable to login, please check your credentials and try again later.`;
    log.error(message);
  }

  public loginSuccessful(email: string) {
    const message = `Logged in as: ${email}`;
    log.step(message);
  }

  public importSpecStep() {
    const message = `Step 1 of 4: Import your OpenAPI Definition`;
    log.step(message);
  }

  //TODO: Very complex validation, needs to be improved.
  public async specPathPrompt(defaultSpecUrl: UrlPath): Promise<string> {
    while (true) {
      const spec = await text({
        message: `Provide a local path or a public URL for your OpenAPI definition file:`,
        placeholder: "Provide absolute URL/local path or press Enter to use a sample OpenAPI file from APIMatic.",
        defaultValue: defaultSpecUrl.toString(),
        validate: (input) => {
          if (!input) return;

          const cleanedPath = this.removeQuotes(input.trim() ?? "");

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
        cancel("Operation cancelled.");
        process.exit(1);
      }

      const cleanedPath = this.removeQuotes(String(spec).trim());

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
          label: `1. Fix the issues using APIMatic's interactive VS Code Extension: ${this.vscodeExtensionUrl}`
        },
        { value: "yes", label: `2. Use an example API spec instead (recommended)` }
      ]
    });

    if (isCancel(useDefaultSpec)) {
      cancel("Operation cancelled.");
      return process.exit(1);
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

  // TODO: Add once you have refactored the validate action.
  public validateSpec(fn: Promise<Result<DirectoryPath, string>>) {
    return withSpinner(
      "Running your API Definition through APIMatic's 1200+ CodeGen Specific validation and linting rules",
      "Validation Successful.",
      "Something went wrong while validating your API Definition.",
      fn
    );
  }

  // TODO: Remove after refactoring validate action.
  public startProgressIndicator(message: string) {
    this.spin.start(message);
  }

  // TODO: Remove after refactoring validate action.
  public stopProgressIndicator(message: string, statusCode?: number) {
    this.spin.stop(message, statusCode);
  }

  public selectLanguagesStep() {
    const message = `Step 3 of 4: Select programming languages`;
    log.step(message);
  }

  public async selectLanguagesPrompt(): Promise<string[]> {
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
      initialValues: ["typescript", "ruby", "python", "java", "csharp", "php", "go"]
    })) as string[];

    if (isCancel(languages)) {
      cancel("Operation cancelled.");
      return process.exit(1);
    }

    return ["http", ...languages];
  }

  public selectInputDirectoryStep() {
    const message = `Step 4 of 4: Generate source files for Docs as Code`;
    log.step(message);
  }

  public async inputDirectoryPathPrompt(): Promise<string> {
    const directory = await text({
      message: "Enter the directory path where you would like to setup the API Portal (Requires an empty directory):",
      placeholder: "Provide absolute path to the directory or press Enter to use the current directory.",
      defaultValue: "./",
      validate: (input) => {
        const cleanedPath = this.removeQuotes(input?.trim() ?? "");
        const dirPath = path.resolve(cleanedPath);

        if (!fs.existsSync(dirPath) && dirPath != this.defaultPortalDirectoryPath) {
          return getMessageInRedColor("Error: The specified directory path does not exist. Please try again.");
        }

        if (dirPath !== this.defaultPortalDirectoryPath) {
          const files = fs.readdirSync(dirPath).filter((item) => !item.startsWith("."));
          if (files.length > 0) {
            return getMessageInRedColor(
              "Error: The target directory is not empty. Please provide a path to an empty directory or clear its contents."
            );
          }
        } else if (fs.existsSync(dirPath)) {
          // For ignoring hidden files and folders in the current directory in MacOS.
          const files = fs.readdirSync(dirPath).filter((item) => !item.startsWith("."));
          if (files.length > 0) {
            return getMessageInRedColor(
              "Error: The target directory is not empty. Please provide a path to an empty directory or clear its contents."
            );
          }
        }
      }
    });

    if (isCancel(directory)) {
      cancel("Operation cancelled.");
      return process.exit(1);
    }

    if (directory === "./") {
      return this.defaultPortalDirectoryPath;
    } else {
      return this.removeQuotes(String(directory).trim());
    }
  }

  public createBuildDirectory(sourceDirectory: string, fn: Promise<Result<DirectoryPath, string>>) {
    return withSpinner(
      "Generating build directory",
      `Directory created at ${sourceDirectory}`,
      "Something went wrong while setting up your build directory.",
      fn
    );
  }

  public buildSetupError(message: string) {
    log.error(message);
  }

  public displayBuildDirectoryAsTree(buildDirectory: string): void {
    const structuredBuildDirectory = this.convertDirectoryStructureToJson(buildDirectory) as treeify.TreeObject;

    const tree = treeify.asTree(structuredBuildDirectory, true, true);

    const coloredLogString = tree
      .split("\n")
      .map((line) => line.replace(/#.*/, (match) => getMessageInGreenColor(match)))
      .join("\n");

    log.step(coloredLogString);
  }

  public portalGenerationError(error: string) {
    log.error(error);
  }

  public nextSteps(buildDirectory: string): void {
    log.step(
      `Your API Portal is live at: ${this.serverUrl}\n` +
        `Hot reload enabled! Edit files in ${buildDirectory} to see changes instantly reflected in your API Portal.\n` +
        `Press CTRL+C to stop the server.`
    );
    log.step(
      `What's next?\n` +
        `- Use the API Playground or an SDK to call your API.\n` +
        `- Customize the Portal theme, add API recipes and enable AI features: ${this.referenceDocumentationUrl}`
    );
  }

  private removeQuotes(str: string): string {
    const quotes = ['"', "'"];

    for (const quote of quotes) {
      if (str.startsWith(quote) && str.endsWith(quote) && str.length > 1) {
        return this.removeQuotes(str.slice(1, -1)); // Recursive call
      }
    }
    return str;
  }

  private convertDirectoryStructureToJson(dirPath: string, parentPath = ""): DirectoryNode {
    const directoryStructure: DirectoryNode = {};

    const items = fs.readdirSync(dirPath);
    items.forEach((item) => {
      if (item === ".git") return; // Skip .git directory

      const itemPath = path.join(dirPath, item);
      const relativePath = path.join(parentPath, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        const subdirectoryStructure = this.convertDirectoryStructureToJson(itemPath, relativePath);

        const folderName = this.descriptions[path.normalize(relativePath)]
          ? `${item} : ${this.descriptions[path.normalize(relativePath)]}`
          : item;

        directoryStructure[folderName] = subdirectoryStructure;
      } else {
        directoryStructure[
          this.descriptions[path.normalize(relativePath)]
            ? `${item} : ${this.descriptions[path.normalize(relativePath)]}`
            : item
        ] = null;
      }
    });

    return directoryStructure;
  }
}
