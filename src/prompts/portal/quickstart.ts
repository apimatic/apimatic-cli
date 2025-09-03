import { Result } from "neverthrow";
import { isCancel, log, multiselect, note, select, text } from "@clack/prompts";
import { UrlPath } from "../../types/file/urlPath.js";
import { format as f, withSpinner, getDirectoryTree } from "../format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { removeQuotes } from "../../utils/string-utils.js";
import { getErrorMessage, ServiceError } from "../../infrastructure/api-utils.js";
import { Directory } from "../../types/file/directory.js";
import { createResourceInputFromInput, ResourceInput } from "../../types/file/resource-input.js";

const vscodeExtensionUrl =
  "https://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode";
const referenceDocumentationUrl = "https://docs.apimatic.io/cli-getting-started/advanced-portal-setup";
const defaultPortalDirectoryPath = process.cwd();

export class PortalQuickstartPrompts {
  public welcomeMessage() {
    log.info(`Hello there.`);
    const message = `This wizard will help you set up an API Portal via APIMatic's Docs as Code workflow in 4 simple steps.
Let's get started!`;
    log.message(message);
  }
  public importSpecStep() {
    const message = `Step 1 of 4: Import your OpenAPI Definition`;
    log.step(message);
  }

  public async specPathPrompt(defaultSpecUrl: UrlPath): Promise<ResourceInput | undefined> {
    const spec = await text({
      message: `Provide a local path or a public URL for your OpenAPI definition file:`,
      placeholder: "Provide absolute URL/local path or press Enter to use a sample OpenAPI file from APIMatic.",
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
    log.error("No API definition was provided.");
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

  public async selectLanguagesPrompt(): Promise<string[] | undefined> {
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
      required: false,
      initialValues: ["typescript", "ruby", "python", "java", "csharp", "php", "go"]
    })) as string[];

    if (isCancel(languages)) {
      return undefined;
    }

    return ["http", ...languages];
  }

  public noLanguagesSelected() {
    log.error("No programming languages were selected.");
  }

  public selectInputDirectoryStep() {
    const message = `Step 4 of 4: Generate source files for Docs as Code`;
    log.step(message);
  }

  public async inputDirectoryPathPrompt(): Promise<DirectoryPath | undefined> {
    const inputDirectory = await text({
      message: "Enter the directory path where you would like to setup the API Portal (Requires an empty directory):",
      placeholder: "Provide absolute path to the directory or press Enter to use the current directory.",
      defaultValue: "./"
    });

    if (isCancel(inputDirectory)) {
      return undefined;
    }

    const cleanedPath = removeQuotes((inputDirectory as string)?.trim() ?? "");
    const directoryPath = new DirectoryPath(cleanedPath);

    if (inputDirectory === "./") {
      return new DirectoryPath(defaultPortalDirectoryPath);
    } else {
      return directoryPath;
    }
  }

  public inputDirectoryPathDoesNotExist(inputDirectory: DirectoryPath) {
    log.error(`The specified directory path ${f.path(inputDirectory)} does not exists.`);
  }

  public inputDirectoryNotEmpty(inputDirectory: DirectoryPath) {
    log.error(
      `The target directory ${f.path(inputDirectory)} is not empty. Please provide a path to an empty directory or clear its contents.`
    );
  }

  public noInputDirectoryProvided() {
    log.error("No build directory was provided.");
  }

  public downloadBuildDirectory(fn: Promise<Result<NodeJS.ReadableStream, ServiceError>>) {
    return withSpinner(
      "Downloading build directory",
      `Build directory downloaded successfully`,
      "Unable to download build directory",
      fn
    );
  }

  public downloadSpecFile(fn: Promise<Result<NodeJS.ReadableStream, ServiceError>>) {
    return withSpinner("Downloading Spec file", `Spec file downloaded`, "Unable to download spec file", fn);
  }

  public nextSteps(): void {
    const message = `Use the API Playground or an SDK to call your API.
Customize the Portal theme, add API recipes and enable AI features
${f.link(referenceDocumentationUrl)}`;
    note(message, "Next steps");
  }

  public serviceError(error: ServiceError) {
    log.error(getErrorMessage(error));
  }

  public printDirectoryStructure(directory: Directory) {
    const tree = getDirectoryTree(directory);
    log.info(tree);
  }
}
