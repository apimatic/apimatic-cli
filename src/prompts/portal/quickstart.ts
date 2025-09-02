import { Result } from "neverthrow";
import { text, select, multiselect, log, isCancel, note } from "@clack/prompts";
import { UrlPath } from "../../types/file/urlPath.js";
import { format as f, withSpinner } from "../format.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { removeQuotes } from "../../utils/string-utils.js";
import { getErrorMessage, ServiceError } from "../../infrastructure/api-utils.js";
import { Directory } from "../../types/file/directory.js";

const vscodeExtensionUrl =
  "https://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode";
const referenceDocumentationUrl = "https://docs.apimatic.io/cli-getting-started/advanced-portal-setup";
const defaultPortalDirectoryPath = process.cwd();

export class PortalQuickstartPrompts {
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

  public async specPathPrompt(defaultSpecUrl: UrlPath): Promise<string | undefined> {
    const spec = await text({
      message: `Provide a local path or a public URL for your OpenAPI definition file:`,
      placeholder: "Provide absolute URL/local path or press Enter to use a sample OpenAPI file from APIMatic.",
      defaultValue: defaultSpecUrl.toString()
    });

    if (isCancel(spec)) {
      return undefined;
    }

    const cleanedPath = removeQuotes(spec.trim() ?? "");

    return cleanedPath;
  }

  public specFileDoesNotExist() {
    log.error("The specified file does not exist or is not a valid file. Please enter a valid file path.");
  }

  public invalidSpecFilePath() {
    log.error("Invalid file path provided. Please enter a valid file path.");
  }

  public invalidSpecUrl() {
    log.error(`Invalid URL. Please check the URL and ensure it points to a valid OpenAPI definition.`);
  }

  public unreachableUrl() {
    log.error(`Failed to reach the URL. Please check your internet connection or the URL.`);
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

    if ((inputDirectory as string) === "./") {
      return new DirectoryPath(defaultPortalDirectoryPath);
    } else {
      return directoryPath;
    }
  }

  public inputDirectoryPathDoesNotExist() {
    log.error("Error: The specified directory path does not exist. Please try again.");
  }

  public inputDirectoryNotEmpty() {
    log.error(
      "Error: The target directory is not empty. Please provide a path to an empty directory or clear its contents."
    );
  }

  public noInputDirectoryProvided() {
    log.error("No build directory was provided.");
  }

  public downloadBuildDirectory(fn: Promise<Result<NodeJS.ReadableStream, ServiceError>>) {
    return withSpinner(
      "Downloading build directory",
      `Build directory downloaded successfully.`,
      "Unable to download build directory.",
      fn
    );
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
    const tree = this.getDirectoryTree(directory);
    log.info(tree);
  }

  private getDirectoryTree(dir: Directory, prefix: string = "", isLast: boolean = true): string {
    const folderDescription: Record<string, string> = {
      spec: "# Contains all API definition files",
      content: "# Includes custom documentation pages in Markdown",
      static: "# Includes all static files, such as images, GIFs, and PDFs"
    };

    const fileDescriptions: Record<string, string> = {
      "toc.yml": "# Controls the structure of the side navigation bar in the API portal",
      "APIMATIC-BUILD.json":
        "# Defines all configurations for the API portal, including programming languages and themes"
    };

    const pointer = isLast ? "└─ " : "├─ ";
    const folderName = dir.directoryPath.leafName();
    const description = folderDescription[folderName] ? f.description(folderDescription[folderName]) : "";
    let output = `${prefix}${pointer}${folderName}${description ? " " + description : ""}\n`;

    const items = dir.items;
    const newPrefix = prefix + (isLast ? "   " : "|  ");

    items.forEach((item, index) => {
      const last = index === items.length - 1;

      if (item instanceof Directory) {
        output += this.getDirectoryTree(item, newPrefix, last);
      } else {
        const filePointer = last ? "└─ " : "├─ ";
        const fileName = item.toString();
        const fileDescription = fileDescriptions[fileName] ? f.description(fileDescriptions[fileName]) : "";
        output += `${newPrefix}${filePointer}${fileName}${fileDescription ? " " + fileDescription : ""}\n`;
      }
    });

    return output;
  }
}
