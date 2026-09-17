import { Result } from 'neverthrow';
import { isCancel, log, select, text } from '@clack/prompts';
import { UrlPath } from '../../types/file/urlPath.js';
import { format as f, getTree } from '../format.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { removeQuotes } from '../../utils/string-utils.js';
import { ServiceError } from '../../infrastructure/service-error.js';
import { Directory } from '../../types/file/directory.js';
import { createResourceInputFromInput, ResourceInput } from '../../types/file/resource-input.js';
import { FileDownloadResponse } from '../../infrastructure/services/file-download-service.js';
import { PortalAuthorizationFailure } from '../../infrastructure/services/portal-authorization-service.js';
import { noteWrapped, withSpinner } from '../prompt.js';
import { reportAuthorizationFailure } from './authorization.js';

const vscodeExtensionUrl =
  'https://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode';
const referenceDocumentationUrl = 'https://docs.apimatic.io/cli-getting-started/advanced-portal-setup';

export class PortalQuickstartPrompts {
  public importSpecStep() {
    log.info(`Step 1 of 3: Import your OpenAPI Definition`);
  }

  public async specPathPrompt(defaultSpecUrl: UrlPath): Promise<ResourceInput | undefined> {
    const spec = await text({
      message: `Provide a local path or a public URL for your OpenAPI Definition file:`,
      placeholder: 'Provide absolute URL/local path or press Enter to use a sample OpenAPI file from APIMatic.',
      defaultValue: defaultSpecUrl.toString(),

      validate: (value) => {
        if (value && !createResourceInputFromInput(value)) {
          return 'Please enter a valid file path or URL.';
        }
      }
    });
    if (isCancel(spec)) {
      return undefined;
    }
    return createResourceInputFromInput(spec);
  }

  public specFileDoesNotExist() {
    log.error('The specified file does not exist or is not a valid file. Please enter a valid file path.');
  }

  public noSpecSpecified() {
    log.error('No API Definition was provided.');
  }

  public async useDefaultSpecPrompt(): Promise<boolean> {
    const useDefaultSpec = await select({
      message: `How would you like to proceed?`,
      options: [
        {
          value: 'no',
          label: `1. Fix the issues using APIMatic's interactive VS Code Extension: ${vscodeExtensionUrl}`
        },
        { value: 'yes', label: `2. Use an example API spec instead (recommended)` }
      ]
    });
    if (isCancel(useDefaultSpec)) {
      return false;
    }
    return useDefaultSpec === 'yes';
  }

  public fixYourSpec() {
    const message = `Good luck fixing your API Definition! Feel free to run this command again once you're done.`;
    log.info(message);
  }

  public validateSpecStep() {
    log.info(`Step 2 of 3: Validate and Lint your OpenAPI Definition`);
  }

  public specValidationFailed() {
    log.error(`Oops, it looks like there are some errors in your API Definition`);
  }

  public createPortalStep() {
    log.info(`Step 3 of 3: Create your portal`);
  }

  public authorizationFailed(failure: PortalAuthorizationFailure) {
    reportAuthorizationFailure(failure);
  }

  public async inputDirectoryPathPrompt(): Promise<DirectoryPath | undefined> {
    const inputDirectory = await text({
      message: 'Enter the directory path where you would like to setup the API Portal (Requires an empty directory):',
      placeholder: 'Provide absolute path to the directory or press Enter to use the current directory.',
      defaultValue: './'
    });

    if (isCancel(inputDirectory)) {
      return undefined;
    }

    const cleanedPath = removeQuotes((inputDirectory as string)?.trim() ?? '');
    return new DirectoryPath(cleanedPath);
  }

  public inputDirectoryPathDoesNotExist(inputDirectory: DirectoryPath) {
    log.error(`The specified directory path ${f.path(inputDirectory)} does not exist.`);
  }

  public inputDirectoryNotEmpty(inputDirectory: DirectoryPath) {
    const message =
      `The target directory ${f.path(inputDirectory)} is not empty. ` +
      `Please provide a path to an empty directory or clear its contents.`;
    log.error(message);
  }

  public noInputDirectoryProvided() {
    log.error('No directory was specified.');
  }

  public downloadSpecFile(fn: Promise<Result<FileDownloadResponse, ServiceError>>) {
    return withSpinner(
      'Downloading API Definition',
      `API Definition downloaded`,
      'Unable to download API Definition',
      fn
    );
  }

  public nextSteps(): void {
    const message =
      `Edit ${f.var('src/portal.json')} to change the title, add a description or point at a logo.\n` +
      `Add Markdown pages under ${f.var('src/content')} and more OpenAPI documents under ${f.var('src/spec')}.\n` +
      `Run ${f.cmdAlt('apimatic', 'portal', 'generate')} to produce static files you can host.\n\n` +
      `${f.link(referenceDocumentationUrl)}`;
    noteWrapped(message, 'Next Steps');
  }

  public serviceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  public printDirectoryStructure(inputDirectory: DirectoryPath, directory: Directory) {
    const heading = `${f.var('src')} directory containing source files created at ${f.path(inputDirectory)}\n`;
    const message = getTree(directory.toTreeNode());
    log.info(heading + message);
  }
}
