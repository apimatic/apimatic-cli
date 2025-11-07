import { isCancel, log, select, text } from "@clack/prompts";
import { Result } from "neverthrow";
import { format as f, getTree } from "../format.js";
import { noteWrapped, withSpinner } from "../prompt.js";
import { UrlPath } from "../../types/file/urlPath.js";
import { createResourceInputFromInput, ResourceInput } from "../../types/file/resource-input.js";
import { FileDownloadResponse } from "../../infrastructure/services/file-download-service.js";
import { ServiceError } from "../../infrastructure/service-error.js";
import { DirectoryPath } from "../../types/file/directoryPath.js";
import { removeQuotes } from "../../utils/string-utils.js";
import { Directory } from "../../types/file/directory.js";
import { Language } from "../../types/sdk/generate.js";
import { UnallowedFeaturesResponse } from "../../infrastructure/services/validation-service.js";

const vscodeExtensionUrl =
  "https://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode";
const sdkCustomizationUrl = "https://docs.apimatic.io/generate-sdks/codegen-settings/codegen-settings-overview/";

export class SdkQuickstartPrompts {
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

  public splitSpecDetected(unallowed: UnallowedFeaturesResponse): void {
    const featuresList = unallowed.Features.map(f => `  • ${Object.values(f)[0]}`).join('\n');
    
    let endpointMessage = "";
    if (unallowed.EndpointLimit < unallowed.EndpointCount) {
      endpointMessage = `\nEndpoint limit exceeded: ${unallowed.EndpointCount} endpoints found, but your plan allows ${unallowed.EndpointLimit}\n`;
    }
  
    const message = [
"Your API Specification includes components not available on your current subscription plan:",
featuresList,
endpointMessage,
"",
"To continue:",
"Remove these components from your API Specification and re-run this command",
"Combine your split API Specification files into a single file. We can automatically remove unsupported components from single-file specs",
"Upgrade your subscription to unlock additional features: `\"https://www.apimatic.io/pricing\"`"
    ].join("\n");

    log.info(message);
  }

  public stripUnallowedFeaturesStep(unallowed: UnallowedFeaturesResponse): void {
    const featuresList = unallowed.Features.map(f => `  • ${f}`).join('\n');
    
    let endpointMessage = "";
    if (unallowed.EndpointLimit < unallowed.EndpointCount) {
      const endpointsToRemove = unallowed.EndpointCount - unallowed.EndpointLimit;
      endpointMessage = `\n${endpointsToRemove} endpoint(s) will be removed from your spec\n`;
    }
    
    const message = [
"Your API Specification includes components not available on your current subscription plan.",
"",
"We'll automatically remove these components before proceeding:",
featuresList,
endpointMessage,
"You won't see these components in the generated SDKs or documentation.",
"Want to keep them? Upgrade your subscription to unlock additional features:\"https://www.apimatic.io/pricing\""
    ].join("\n");

    log.info(message);
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

  public serviceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
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

  public async selectLanguagePrompt(): Promise<Language | undefined> {
    const language = await select({
      message: "Choose the programming language for your SDK:",
      options: [
        { label: "Typescript", value: Language.TYPESCRIPT },
        { label: "Ruby", value: Language.RUBY },
        { label: "Python", value: Language.PYTHON },
        { label: "Java", value: Language.JAVA },
        { label: "C#", value: Language.CSHARP },
        { label: "PHP", value: Language.PHP },
        { label: "Go", value: Language.GO }
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
    return new DirectoryPath(cleanedPath);
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

  public sdkOpenedInEditor() {
    log.info("Opened the SDK directory in VS Code. To get started with your SDK, review the README file.");
  }

  public nextSteps(language: Language, specDirectory: DirectoryPath): void {
    const specDirectoryFlag = !specDirectory.isEqual(DirectoryPath.default) ? `${f.flag("spec", specDirectory.toString())} `: "";
    const message = `Run the command
'${f.cmdAlt("apimatic", "sdk", "generate")} ${specDirectoryFlag}${f.flag("language", language)}'
to regenerate your SDK.

To learn more about customizing your SDK, visit:
${f.link(sdkCustomizationUrl)}`;
    noteWrapped(message, "Next Steps");
  }
}
