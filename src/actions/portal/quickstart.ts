import { getAuthInfo } from '../../client-utils/auth-manager.js';
import { FileService } from '../../infrastructure/file-service.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { PortalQuickstartPrompts } from '../../prompts/portal/quickstart.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { FilePath } from '../../types/file/filePath.js';
import { UrlPath } from '../../types/file/urlPath.js';
import { LoginAction } from '../auth/login.js';
import { ActionResult } from '../action-result.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { ValidateAction } from '../api/validate.js';
import { SpecContext } from '../../types/spec-context.js';
import { OpenApiDocument, SpecFormat } from '../../types/portal/openapi-document.js';
import { PortalSourceContext } from '../../types/portal-source-context.js';
import { PortalAuthorizationService } from '../../infrastructure/services/portal-authorization-service.js';
import { FileDownloadService } from '../../infrastructure/services/file-download-service.js';
import { PortalProjectService } from '../../infrastructure/portal-project-service.js';
import { envInfo } from '../../infrastructure/env-info.js';
import { schemaUrlFor } from '../../types/apimatic-config/document.js';
import { PluginConfigContext } from '../../types/plugin-config-context.js';
import { deriveMetadata } from '../../types/plugin/plugin-config.js';

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
    // Asked before anything is written: the user's next command is `portal serve`, which
    // refuses an installation missing the portal build's dependencies, and learning that after
    // the wizard leaves a tree to clean up.
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

    // Checked before any question is asked: `portal serve`, the next command, refuses without
    // this entitlement.
    const authorization = await this.authorizationService.authorize(this.configDir, this.commandMetadata.shell, null);
    if (authorization.isErr()) {
      this.prompts.authorizationFailed(authorization.error);
      return ActionResult.failed();
    }

    return await withDirPath<ActionResult>(async (tempDirectory: DirectoryPath): Promise<ActionResult> => {
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
            if (sampleUrl !== null && inputPath.isEqual(sampleUrl)) {
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
      // here rather than left to `portal serve`, which refuses only once the project is
      // written -- and running the wizard again then rejects the non-empty tree it created.
      const format = await this.specFormat(specPath);
      if (!format.supported) {
        if (format.format === null) {
          this.prompts.specNotRecognised(specPath);
        } else {
          this.prompts.specFormatUnsupported(specPath, format.format);
        }
        return ActionResult.failed();
      }

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
      const scaffolded = await new PortalSourceContext(sourceDirectory).scaffold(
        specPath,
        schemaUrlFor(envInfo.getCLIVersion())
      );
      if (scaffolded.isErr()) {
        this.prompts.scaffoldFailed(scaffolded.error, sourceDirectory);
        return ActionResult.failed();
      }

      const selection = await this.prompts.selectLanguages();
      if (!selection?.length) {
        this.prompts.noLanguagesSelected();
        return ActionResult.cancelled();
      }

      // Recorded before anything is built: `apimatic.json` is what says which SDKs the portal
      // documents and what names its plugin, and every command after this one reads it rather
      // than the answers. The identity is derived, never asked: quickstart has two questions and
      // neither of them is about plugins.
      const configContext = new PluginConfigContext(sourceDirectory);
      const recorded = await configContext
        .recordLanguages(selection)
        .then(async (languages) =>
          languages.isErr() ? languages : await configContext.upsertMetadata(deriveMetadata(inputDirectory.leafName()))
        );
      if (recorded.isErr()) {
        this.prompts.configNotWritten();
        return ActionResult.failed();
      }

      const structure = await this.fileService.getDirectory(sourceDirectory);
      this.prompts.printDirectoryStructure(inputDirectory, structure);

      // The wizard does not ask for the project's SDK languages yet, and a portal is not built
      // without them, so it ends here and says what to add rather than starting a preview that
      // refuses the project it just wrote.
      this.prompts.nextSteps(scaffolded.value, inputDirectory);
      return ActionResult.success();
    });
  };

  // A split specification arrives as an archive, and a file that cannot be read is left to
  // the build too, which says so with the file in front of it.
  private async specFormat(specPath: FilePath): Promise<SpecFormat> {
    try {
      if (await this.fileService.isZipFile(specPath)) {
        return { supported: true };
      }
      const document = OpenApiDocument.parse(specPath.name(), await this.fileService.getContents(specPath));
      return document === undefined ? { supported: true } : document.format();
    } catch {
      return { supported: true };
    }
  }
}
