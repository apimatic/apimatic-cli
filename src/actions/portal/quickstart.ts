import { parse as parseYaml } from 'yaml';
import { getAuthInfo } from '../../client-utils/auth-manager.js';
import { FileService } from '../../infrastructure/file-service.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PortalQuickstartPrompts } from '../../prompts/portal/quickstart.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FileName } from '../../types/file/fileName.js';
import { FilePath } from '../../types/file/filePath.js';
import { UrlPath } from '../../types/file/urlPath.js';
import { LoginAction } from '../auth/login.js';
import { ActionResult } from '../action-result.js';
import { PortalServeAction } from './serve.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { ValidateAction } from '../api/validate.js';
import { SpecContext } from '../../types/spec-context.js';
import { PortalConfig } from '../../types/portal/portal-config.js';
import { PortalAuthorizationService } from '../../infrastructure/services/portal-authorization-service.js';
import { FileDownloadService } from '../../infrastructure/services/file-download-service.js';

const defaultPort: number = 23513 as const;

export class PortalQuickstartAction {
  private readonly prompts: PortalQuickstartPrompts = new PortalQuickstartPrompts();
  private readonly fileService: FileService = new FileService();
  private readonly fileDownloadService = new FileDownloadService();
  private readonly authorizationService = new PortalAuthorizationService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly defaultSpecUrl = new UrlPath(
    `https://raw.githubusercontent.com/apimatic/sample-docs-as-code-portal/refs/heads/master/src/spec/openapi.json`
  );

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
  }

  public readonly execute = async (): Promise<ActionResult> => {
    const storedAuth = await getAuthInfo(this.configDir.toString());
    if (!storedAuth?.authKey) {
      const loginResult = await new LoginAction(this.configDir, this.commandMetadata).execute();
      if (loginResult.isFailed()) {
        return ActionResult.failed();
      }
    }

    // Checked before any question is asked: the flow ends in `portal serve`, which refuses
    // without this entitlement, and finding that out after four prompts would be rude.
    const authorization = await this.authorizationService.authorize(this.configDir, this.commandMetadata.shell, null);
    if (authorization.isErr()) {
      this.prompts.authorizationFailed(authorization.error);
      return ActionResult.cancelled();
    }

    return await withDirPath<ActionResult>(async (tempDirectory: DirectoryPath): Promise<ActionResult> => {
      // Step 1/3
      this.prompts.importSpecStep();

      let specPath: FilePath | undefined;
      while (!specPath) {
        const inputPath = await this.prompts.specPathPrompt(this.defaultSpecUrl);
        if (!inputPath) {
          this.prompts.noSpecSpecified();
          return ActionResult.cancelled();
        }

        if (inputPath instanceof UrlPath) {
          const downloadFileResult = await this.prompts.downloadSpecFile(
            this.fileDownloadService.downloadFile(inputPath)
          );
          if (downloadFileResult.isErr()) {
            this.prompts.serviceError(downloadFileResult.error);
          } else {
            const specContext = new SpecContext(tempDirectory);
            specPath = await specContext.save(downloadFileResult.value.stream, downloadFileResult.value.filename);
          }
        } else {
          const fileExists = await this.fileService.fileExists(inputPath);
          if (!fileExists) {
            this.prompts.specFileDoesNotExist();
          } else {
            specPath = inputPath;
          }
        }
      }

      // Step 2/3
      this.prompts.validateSpecStep();
      const validateAction = new ValidateAction(this.configDir, this.commandMetadata);
      const validationResult = await validateAction.execute(specPath, false);

      if (validationResult.isFailed()) {
        this.prompts.specValidationFailed();
        if (!(await this.prompts.useDefaultSpecPrompt())) {
          this.prompts.fixYourSpec();
          return ActionResult.cancelled();
        }
        const downloadFileResult = await this.prompts.downloadSpecFile(
          this.fileDownloadService.downloadFile(this.defaultSpecUrl)
        );
        if (downloadFileResult.isErr()) {
          this.prompts.serviceError(downloadFileResult.error);
          return ActionResult.failed();
        }
        const specContext = new SpecContext(tempDirectory);
        specPath = await specContext.save(downloadFileResult.value.stream, downloadFileResult.value.filename);
      }

      // Step 3/3
      this.prompts.createPortalStep();
      let inputDirectory: DirectoryPath | undefined;
      while (true) {
        inputDirectory = await this.prompts.inputDirectoryPathPrompt();
        if (!inputDirectory) {
          this.prompts.noInputDirectoryProvided();
          return ActionResult.cancelled();
        }

        if (!(await this.fileService.directoryExists(inputDirectory))) {
          this.prompts.inputDirectoryPathDoesNotExist(inputDirectory);
          continue;
        }

        if (!(await this.fileService.directoryEmpty(inputDirectory))) {
          this.prompts.inputDirectoryNotEmpty(inputDirectory);
          continue;
        }
        break;
      }

      const sourceDirectory = inputDirectory.join('src');
      await this.scaffold(sourceDirectory, specPath);

      const structure = await this.fileService.getDirectory(sourceDirectory);
      this.prompts.printDirectoryStructure(inputDirectory, structure);

      const portalServeAction = new PortalServeAction(this.configDir, this.commandMetadata, null);
      const result = await portalServeAction.execute(sourceDirectory, defaultPort, true, () => {
        this.prompts.nextSteps();
      });

      if (result.isFailed()) {
        return ActionResult.failed();
      }

      return ActionResult.success();
    });
  };

  /** Writes the smallest source tree `portal generate` and `portal serve` accept. */
  private async scaffold(sourceDirectory: DirectoryPath, specPath: FilePath): Promise<void> {
    const specContext = new SpecContext(sourceDirectory.join('spec'));
    await specContext.install(specPath);

    const config = await this.describeApi(specPath);
    await this.fileService.writeContents(
      new FilePath(sourceDirectory, new FileName('portal.json')),
      JSON.stringify(config, null, 2) + '\n'
    );

    const contentDirectory = sourceDirectory.join('content');
    await this.fileService.createDirectoryIfNotExists(contentDirectory);
    await this.fileService.writeContents(
      new FilePath(contentDirectory, new FileName('index.md')),
      [
        '---',
        'title: Welcome',
        `description: Getting started with ${config.title}`,
        '---',
        '',
        `Welcome to the ${config.title} documentation.`,
        '',
        'Replace this page with your own introduction, and add more Markdown pages beside it.',
        ''
      ].join('\n')
    );
    // Orders the sidebar: named pages first, then everything else alphabetically.
    await this.fileService.writeContents(
      new FilePath(contentDirectory, new FileName('meta.json')),
      JSON.stringify({ pages: ['index', '...'] }, null, 2) + '\n'
    );
  }

  // Saves the user a question: a valid OpenAPI document already carries the portal's title
  // and description. A split spec arrives as an archive, which falls back to the default.
  private async describeApi(specPath: FilePath): Promise<PortalConfig> {
    const fallback = PortalConfig.create('My API');
    try {
      if (await this.fileService.isZipFile(specPath)) {
        return fallback;
      }
      const contents = await this.fileService.getContents(specPath);
      const document = specPath.toString().toLowerCase().endsWith('.json') ? JSON.parse(contents) : parseYaml(contents);
      const info = document?.info;
      const title = typeof info?.title === 'string' && info.title.trim().length > 0 ? info.title.trim() : null;
      const description =
        typeof info?.description === 'string' && info.description.trim().length > 0
          ? info.description.trim().split('\n')[0].slice(0, 300)
          : null;
      return title === null ? fallback : PortalConfig.create(title, description);
    } catch {
      return fallback;
    }
  }
}
