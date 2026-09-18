import { parse as parseYaml } from 'yaml';
import { stripByteOrderMark } from '../../utils/string-utils.js';
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
import { PortalProjectService } from '../../infrastructure/portal-project-service.js';

const defaultPort: number = 23513 as const;

export class PortalQuickstartAction {
  private readonly prompts: PortalQuickstartPrompts = new PortalQuickstartPrompts();
  private readonly fileService: FileService = new FileService();
  private readonly fileDownloadService = new FileDownloadService();
  private readonly authorizationService = new PortalAuthorizationService();
  private readonly projectService = new PortalProjectService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly defaultSpecUrl = new UrlPath(
    `https://raw.githubusercontent.com/apimatic/sample-docs-as-code-portal/refs/heads/v2/src/spec/petstore.json`
  );

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
  }

  public readonly execute = async (): Promise<ActionResult> => {
    // Asked of this machine before anything is written: the flow ends in `portal serve`,
    // which refuses on an older Node, and it used to refuse after scaffolding the project.
    const runtimeProblem = this.projectService.runtimeProblem();
    if (runtimeProblem !== null) {
      this.prompts.runtimeUnsupported(runtimeProblem);
      return ActionResult.failed();
    }

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
      // Dropped once the CLI's own sample has failed: re-offering the address the user just
      // watched fail, pre-filled, is the one suggestion that cannot work.
      let sampleUrl: UrlPath | null = this.defaultSpecUrl;
      while (!specPath) {
        const inputPath = await this.prompts.specPathPrompt(sampleUrl);
        if (!inputPath) {
          this.prompts.noSpecSpecified();
          return ActionResult.cancelled();
        }

        if (inputPath instanceof UrlPath) {
          const downloadFileResult = await this.prompts.downloadSpecFile(
            this.fileDownloadService.downloadFile(inputPath)
          );
          if (downloadFileResult.isErr()) {
            this.prompts.specDownloadFailed(inputPath, downloadFileResult.error);
            if (sampleUrl !== null && inputPath.toString() === sampleUrl.toString()) {
              sampleUrl = null;
            }
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

      // The validation above accepts Swagger 2.0, which a portal cannot be built from. Asked
      // here rather than by `portal serve` below, which used to refuse only after the
      // project had been written -- and the directory prompt then refuses a non-empty one,
      // so the user had to delete the tree the wizard itself had just created.
      const unsupportedFormat = await this.unsupportedSpecFormat(specPath);
      if (unsupportedFormat !== null) {
        this.prompts.specFormatUnsupported(specPath, unsupportedFormat);
        return ActionResult.failed();
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
        // JSON is valid YAML. Quoting through it keeps a title carrying ': ' or '#' from
        // breaking the front matter, which fails the whole build rather than one page.
        `description: ${JSON.stringify(`Getting started with ${config.siteTitle()}`)}`,
        '---',
        '',
        `Welcome to the ${config.siteTitle()} documentation.`,
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
      const document = this.parseSpec(specPath, await this.fileService.getContents(specPath));
      const info = document?.info;
      // Both values are written into generated files, so each is reduced to one line first.
      // Taking only the description's first line instead left the 300-character cap
      // unreachable for the common specification whose description is wrapped prose.
      const title = this.oneLine(info?.title);
      const description = this.oneLine(info?.description);
      return title === null ? fallback : PortalConfig.create(title, description && this.cap(description, 300));
    } catch {
      return fallback;
    }
  }

  /**
   * Names the format when the document is not one a portal can be built from, or null when
   * it is. A split specification arrives as an archive and is left to the build to judge.
   */
  private async unsupportedSpecFormat(specPath: FilePath): Promise<string | null> {
    try {
      if (await this.fileService.isZipFile(specPath)) {
        return null;
      }
      const document = this.parseSpec(specPath, await this.fileService.getContents(specPath));

      const openapi = document?.openapi;
      if (typeof openapi === 'string') {
        return openapi.startsWith('3.') ? null : `OpenAPI ${openapi}`;
      }
      if (document?.swagger !== undefined) {
        return `Swagger ${document.swagger}`;
      }
      if (document?.asyncapi !== undefined) {
        return `AsyncAPI ${document.asyncapi}`;
      }
      return null;
    } catch {
      // Unreadable here means the build will say so with the file in front of it.
      return null;
    }
  }

  /**
   * The specification as an object, however it was written. Both readers below need this,
   * and only one of them used to strip the byte-order mark that a Windows editor or a
   * PowerShell redirection leaves at the front of the file -- so such a document passed the
   * format check and was then described as "My API", its real title silently discarded.
   */
  private parseSpec(
    specPath: FilePath,
    contents: string
  ): { info?: Record<string, unknown> } & Record<string, unknown> {
    const text = stripByteOrderMark(contents);
    return specPath.name().hasExtension('.json') ? JSON.parse(text) : parseYaml(text);
  }

  private oneLine(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const collapsed = value.replace(/\s+/g, ' ').trim();
    return collapsed.length > 0 ? collapsed : null;
  }

  // Cuts on a word boundary when one is near enough the limit, so the site description does
  // not end mid-word.
  private cap(value: string, limit: number): string {
    if (value.length <= limit) {
      return value;
    }
    const cut = value.slice(0, limit);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > limit - 40 ? cut.slice(0, lastSpace) : cut).trimEnd();
  }
}
