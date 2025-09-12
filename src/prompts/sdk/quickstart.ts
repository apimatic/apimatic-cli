import { isCancel, log, select, text } from "@clack/prompts";
import { Result } from "neverthrow";
import { format as f, getTree, withSpinner } from "../format.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { createResourceInputFromInput, ResourceInput } from "../../types/file/resource-input.js";
import { FileDownloadResponse } from "../../infrastructure/services/file-download-service.js";
import { getErrorMessage, ServiceError } from "../../infrastructure/api-utils.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { removeQuotes } from "../../utils/string-utils.js";
import { Directory } from "../../types/file/directory.js";

const vscodeExtensionUrl =
  "https://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode";
const defaultSrcDirectoryPath = process.cwd();

export class SdkQuickstartPrompts {
  public welcomeMessage() {
    log.info(`Welcome to the SDK Quickstart Wizard.`);
    log.message(`This wizard will help you set up an SDK of your desired language in 4 simple steps.
Let's get started!`);
  }

  public importSpecStep() {
    log.info(`Step 1 of 4: Import your OpenAPI Definition`);
  }

  public async specPathPrompt(defaultSpecUrl: UrlPath): Promise<ResourceInput | undefined> {
    const spec = await text({
      message: `Provide a local path or a public URL for your OpenAPI Definition file:`,
      placeholder:
        "Provide absolute URL/local path or press Enter to use a sample OpenAPI Definition file from APIMatic.",
      defaultValue: defaultSpecUrl.toString(),

      validate: (value) => {
        if (value && !createResourceInputFromInput(value)) {
          return "Please enter a valid file path or URL.";
        }
      }
    });

    if (isCancel(spec)) {
      return undefined;
    }

    return createResourceInputFromInput(spec);
  }

  public specFileDoesNotExist() {
    log.error("The specified file does not exist or is not a valid file. Please enter a valid file path.");
  }

  public noSpecSpecified() {
    log.error("No API Definition was provided.");
  }

  public downloadSpecFile(fn: Promise<Result<FileDownloadResponse, ServiceError>>) {
    return withSpinner(
      "Downloading API Definition",
      `API Definition downloaded`,
      "Unable to download API Definition",
      fn
    );
  }

  public serviceError(error: ServiceError) {
    log.error(getErrorMessage(error));
  }

  public validateSpecStep() {
    log.info(`Step 2 of 4: Validate and Lint your OpenAPI Definition`);
  }

  public specValidationFailed() {
    log.error(`Oops, it looks like there are some errors in your API Definition`);
  }

  public async useDefaultSpecPrompt(): Promise<boolean> {
    const useDefaultSpec = await select({
      message: `How would you like to proceed?`,
      options: [
        {
          value: "no",
          label: `1. Fix the issues using APIMatic's interactive VS Code Extension: ${vscodeExtensionUrl}`
        },
        { value: "yes", label: `2. Use an example API Definition instead (recommended)` }
      ]
    });

    if (isCancel(useDefaultSpec)) {
      return false;
    }

    return useDefaultSpec === "yes";
  }

  public fixYourSpec() {
    const message = `Good luck fixing your API Definition! Feel free to run this command again once you're done.`;
    log.info(message);
  }

  public selectLanguageStep() {
    log.info(`Step 3 of 4: Select programming language`);
  }

  public async selectLanguagePrompt(): Promise<string | undefined> {
    const language = await select({
      message: "Your SDK will be generated for the following language:",
      options: [
        { label: "Typescript", value: "typescript" },
        { label: "Ruby", value: "ruby" },
        { label: "Python", value: "python" },
        { label: "Java", value: "java" },
        { label: "C#", value: "csharp" },
        { label: "PHP", value: "php" },
        { label: "Go", value: "go" }
      ]
    });

    if (isCancel(language)) {
      return undefined;
    }

    return language;
  }

  public noLanguageSelected() {
    log.error("No programming language was selected.");
  }

  public selectInputDirectoryStep() {
    log.info(`Step 4 of 4: Setup directory for SDK Generation`);
  }

  public async inputDirectoryPathPrompt(): Promise<DirectoryPath | undefined> {
    const inputDirectory = await text({
      message: "Enter the directory path where you would like to setup the SDK (Requires an empty directory):",
      placeholder: "Provide absolute path to the directory or press Enter to use the current directory.",
      defaultValue: "./"
    });

    if (isCancel(inputDirectory)) {
      return undefined;
    }

    const cleanedPath = removeQuotes((inputDirectory as string)?.trim() ?? "");
    const directoryPath = new DirectoryPath(cleanedPath);

    if (inputDirectory === "./") {
      return new DirectoryPath(defaultSrcDirectoryPath);
    } else {
      return directoryPath;
    }
  }

  public noInputDirectoryProvided() {
    log.error("No directory was specified.");
  }

  public inputDirectoryPathDoesNotExist(inputDirectory: DirectoryPath) {
    log.error(`The specified directory path ${f.path(inputDirectory)} does not exist.`);
  }

  public inputDirectoryNotEmpty(inputDirectory: DirectoryPath) {
    log.error(
      `The target directory ${f.path(
        inputDirectory
      )} is not empty. Please provide a path to an empty directory or clear its contents.`
    );
  }

  public downloadMetadataFile(fn: Promise<Result<FileDownloadResponse, ServiceError>>) {
    return withSpinner(
      "Setting up source directory",
      `Source directory set up successfully`,
      "Unable to set up source directory",
      fn
    );
  }

  public printDirectoryStructure(inputDirectory: DirectoryPath, directory: Directory) {
    const heading = `${f.var("src")} directory containing source files created at ${f.path(inputDirectory)}\n`;
    const message = getTree(directory.toTreeNode());
    log.info(heading + message);
  }
}
