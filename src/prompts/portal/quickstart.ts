import { Result } from 'neverthrow';
import { isCancel, log, select, text } from '@clack/prompts';
import { UrlPath } from '../../types/file/urlPath.js';
import { format as f, getTree } from '../format.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { removeQuotes } from '../../utils/string-utils.js';
import { ServiceError } from '../../infrastructure/service-error.js';
import { Directory } from '../../types/file/directory.js';
import { createResourceInputFromInput, ResourceInput } from '../../types/file/resource-input.js';
import { FileDownloadResponse } from '../../infrastructure/services/file-download-service.js';
import { PortalAuthorizationFailure } from '../../infrastructure/services/portal-authorization-service.js';
import { APIMATIC_CONFIG_FILE_NAME } from '../../types/apimatic-config/document.js';
import { LANGUAGES_EXAMPLE } from '../../types/portal/portal-languages.js';
import { PortalScaffoldProblem } from '../../types/portal/portal-source.js';
import { noteWrapped, withSpinner } from '../prompt.js';
import { reportAuthorizationFailure } from './authorization.js';

const vscodeExtensionUrl =
  'https://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode';
const referenceDocumentationUrl = 'https://docs.apimatic.io/cli-getting-started/advanced-portal-setup';

export class PortalQuickstartPrompts {
  public importSpecStep() {
    log.info(`Step 1 of 3: Import your OpenAPI Definition`);
  }

  /** `defaultSpecUrl` is null once the sample has failed to download; it is not offered again. */
  public async specPathPrompt(defaultSpecUrl: UrlPath | null): Promise<ResourceInput | undefined> {
    const spec = await text({
      message: `Provide a local path or a public URL for your OpenAPI Definition file:`,
      placeholder: defaultSpecUrl
        ? 'Provide absolute URL/local path or press Enter to use a sample OpenAPI file from APIMatic.'
        : 'Provide an absolute URL or local path to your OpenAPI Definition file.',
      ...(defaultSpecUrl === null ? {} : { defaultValue: defaultSpecUrl.toString() }),

      validate: (value) => {
        if (!value && defaultSpecUrl === null) {
          return 'Please enter a file path or URL.';
        }
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

  public specFormatUnsupported(specPath: FilePath, format: string) {
    log.error(
      `${f.path(specPath)} is ${format}. Portals are generated from OpenAPI 3.x documents; ` +
        `convert it with ${f.cmdAlt('apimatic', 'api', 'transform')} first.`
    );
  }

  /** For a document that names no format at all: a Postman collection, an arbitrary JSON file. */
  public specNotRecognised(specPath: FilePath) {
    log.error(
      `${f.path(specPath)} is not an OpenAPI document: it names no ${f.var('openapi')} version. ` +
        `Portals are generated from OpenAPI 3.x documents.`
    );
  }

  public runtimeUnsupported(reason: string) {
    log.error(reason);
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
      message:
        'Enter the directory path where you would like to setup the API Portal (must be empty, apart from hidden files such as .git):',
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

  public scaffoldFailed(problem: PortalScaffoldProblem, sourceDirectory: DirectoryPath) {
    switch (problem.kind) {
      case 'configUnreadable': {
        const message =
          `${f.var(APIMATIC_CONFIG_FILE_NAME)} is already in ${f.path(sourceDirectory)} and could not be read, ` +
          `so the portal was not written into it.`;
        log.error(message);
        return;
      }
      case 'configUnwritable': {
        log.error(`${f.var(APIMATIC_CONFIG_FILE_NAME)} could not be written to ${f.path(sourceDirectory)}.`);
        return;
      }
      case 'sourceUnwritable': {
        log.error(`${f.path(sourceDirectory)} could not be written: ${problem.reason}`);
        return;
      }
    }
  }

  public downloadSpecFile(fn: Promise<Result<FileDownloadResponse, ServiceError>>) {
    return withSpinner(
      'Downloading API Definition',
      `API Definition downloaded`,
      'Unable to download API Definition',
      fn
    );
  }

  /**
   * The `languages` block is the project's one list of SDK languages, which the plugin commands
   * read too, hence the line on naming only what is shipped.
   */
  public nextSteps(configFile: FilePath, projectDirectory: DirectoryPath): void {
    const message = [
      `1. Name the SDK languages your API ships in ${f.path(configFile)}, beside the ${f.var(
        'portal'
      )} block, for example:`,
      '',
      `     ${LANGUAGES_EXAMPLE}`,
      '',
      `   This is the project's one list of SDK languages: the plugin commands read it too, and ` +
        `${f.cmdAlt('apimatic', 'sdk', 'publish')} adds to it, so name only the languages you ship.`,
      '',
      `2. Preview the portal with ${f.cmdAlt('apimatic', 'portal', 'serve')} ${f.flag(
        'input',
        projectDirectory.toString()
      )}. It reloads as you edit.`,
      '',
      `Change the name, colours and fonts in the ${f.var('portal')} block; your editor completes ` +
        `and checks it. Set ${f.var('portal.site.url')} to the address you will host the portal at, for ` +
        `canonical links and a sitemap. Add Markdown pages under ${f.var('src/content')} and more OpenAPI ` +
        `documents under ${f.var('src/spec')}, and run ${f.cmdAlt('apimatic', 'portal', 'generate')} to ` +
        `produce static files you can host.`,
      '',
      f.link(referenceDocumentationUrl)
    ].join('\n');
    noteWrapped(message, 'Next Steps');
  }

  public serviceError(serviceError: ServiceError) {
    log.error(serviceError.errorMessage);
  }

  /** Names the address that failed: without it the same message repeats for every retry. */
  public specDownloadFailed(url: UrlPath, serviceError: ServiceError) {
    log.error(`${serviceError.errorMessage} Could not download ${f.link(url.toString())}.`);
  }

  public printDirectoryStructure(inputDirectory: DirectoryPath, directory: Directory) {
    const heading = `${f.var('src')} directory containing source files created at ${f.path(inputDirectory)}\n`;
    const message = getTree(directory.toTreeNode());
    log.info(heading + message);
  }
}
