import { err, ok, Result } from 'neverthrow';
import { getAuthInfo } from '../client-utils/auth-manager.js';
import { FileService } from '../infrastructure/file-service.js';
import { withDirPath } from '../infrastructure/tmp-extensions.js';
import { QuickstartPrompts } from '../prompts/quickstart.js';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FilePath } from '../types/file/filePath.js';
import { UrlPath } from '../types/file/urlPath.js';
import { LoginAction } from './auth/login.js';
import { ActionResult } from './action-result.js';
import { CommandMetadata } from '../types/common/command-metadata.js';
import { ValidateAction } from './api/validate.js';
import { SpecContext } from '../types/spec-context.js';
import { OpenApiDocument, SpecFormat } from '../types/portal/openapi-document.js';
import { PortalAuthorizationService } from '../infrastructure/services/portal-authorization-service.js';
import { FileDownloadService } from '../infrastructure/services/file-download-service.js';
import { PortalProjectService } from '../infrastructure/portal-project-service.js';
import { envInfo } from '../infrastructure/env-info.js';
import { schemaUrlFor } from '../types/apimatic-config/document.js';
import { PLACEHOLDER_METADATA } from '../types/plugin/plugin-config.js';
import { ProjectContext } from '../types/project-context.js';
import { DEFAULT_PORTAL_PORT, PortalServeAction } from './portal/serve.js';

/** What the wizard writes into, and the specification it builds the portal from. */
interface Chosen {
  project: ProjectContext;
  /** Held rather than asked of the context: the wizard is what chose it. */
  projectDirectory: DirectoryPath;
  specPath: FilePath;
  /** True when the project arrived with its own `src/`, which is left where it is. */
  adopted: boolean;
}

export class QuickstartAction {
  private readonly prompts: QuickstartPrompts = new QuickstartPrompts();
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

  public readonly execute = async (workingDirectory: DirectoryPath): Promise<ActionResult> => {
    this.prompts.welcomeMessage();

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

    return await withDirPath<ActionResult>((tempDirectory: DirectoryPath) =>
      this.runWizard(workingDirectory, tempDirectory)
    );
  };

  private async runWizard(workingDirectory: DirectoryPath, tempDirectory: DirectoryPath): Promise<ActionResult> {
    const project = await this.findProject(workingDirectory, tempDirectory);
    if (project.isErr()) {
      return project.error;
    }
    const { project: chosen, projectDirectory, specPath, adopted } = project.value;
    const schemaUrl = schemaUrlFor(envInfo.getCLIVersion());

    const source = chosen.portalSource();
    const scaffolded = adopted ? await source.adopt(specPath, schemaUrl) : await source.scaffold(specPath, schemaUrl);
    const sourceDirectory = chosen.sourceDirectory();
    if (scaffolded.isErr()) {
      this.prompts.scaffoldFailed(scaffolded.error, sourceDirectory);
      return ActionResult.failed();
    }

    const selection = await this.prompts.selectLanguages();
    if (!selection?.length) {
      this.prompts.noLanguagesSelected();
      return ActionResult.cancelled();
    }

    const pluginConfig = chosen.pluginConfig();
    const languagesRecorded = await pluginConfig.recordLanguages(selection);
    const pluginConfigRecorded = languagesRecorded.isErr()
      ? languagesRecorded
      : await pluginConfig.upsertMetadata(PLACEHOLDER_METADATA);
    if (pluginConfigRecorded.isErr()) {
      this.prompts.configNotWritten(pluginConfigRecorded.error, sourceDirectory);
      return ActionResult.failed();
    }

    // Reported rather than fatal: what Git tracks does not decide whether a portal can be built.
    const ignored = await chosen.upsertGitignore();
    if (ignored.isErr()) {
      this.prompts.gitignoreNotUpdated(ignored.error, projectDirectory);
    }

    const structure = await this.fileService.getDirectory(sourceDirectory);
    this.prompts.printDirectoryStructure(projectDirectory, structure);

    const result = await new PortalServeAction(this.configDir, this.commandMetadata, null).execute(
      chosen,
      DEFAULT_PORTAL_PORT,
      true,
      () => this.prompts.nextSteps(scaffolded.value)
    );

    return result.isFailed() ? ActionResult.failed() : ActionResult.success();
  }

  /**
   * A build downloaded from the platform arrives with its specification already in `src/spec/`,
   * so that project is adopted where it stands rather than asked for a second time.
   */
  private async findProject(
    workingDirectory: DirectoryPath,
    tempDirectory: DirectoryPath
  ): Promise<Result<Chosen, ActionResult>> {
    const here = ProjectContext.in(workingDirectory);
    const adoptedSpec = await here.portalSource().primarySpec();

    if (adoptedSpec !== null) {
      this.prompts.importSpecStepAdopted(here.sourceDirectory());
      const validated = await this.validate(adoptedSpec, tempDirectory, true);
      if (validated.isErr()) {
        return err(validated.error);
      }
      this.prompts.createPortalStep();
      return ok({ project: here, projectDirectory: workingDirectory, specPath: validated.value, adopted: true });
    }

    this.prompts.importSpecStep();
    const imported = await this.importSpec(tempDirectory);
    if (imported === undefined) {
      return err(ActionResult.cancelled());
    }
    const validated = await this.validate(imported, tempDirectory, false);
    if (validated.isErr()) {
      return err(validated.error);
    }

    this.prompts.createPortalStep();
    const projectDirectory = await this.chooseProjectDirectory();
    if (projectDirectory === undefined) {
      return err(ActionResult.cancelled());
    }
    return ok({
      project: ProjectContext.in(projectDirectory),
      projectDirectory,
      specPath: validated.value,
      adopted: false
    });
  }

  private async importSpec(tempDirectory: DirectoryPath): Promise<FilePath | undefined> {
    // Dropped once the CLI's own sample has failed: re-offering the address the user just
    // watched fail, pre-filled, is the one suggestion that cannot work.
    let sampleUrl: UrlPath | null = this.defaultSpecUrl;
    for (;;) {
      const inputPath = await this.prompts.specPathPrompt(sampleUrl);
      if (!inputPath) {
        this.prompts.noSpecSpecified();
        return undefined;
      }

      if (inputPath instanceof UrlPath) {
        const downloaded = await this.prompts.downloadSpecFile(this.fileDownloadService.downloadFile(inputPath));
        if (downloaded.isErr()) {
          this.prompts.specDownloadFailed(inputPath, downloaded.error);
          if (sampleUrl !== null && inputPath.isEqual(sampleUrl)) {
            sampleUrl = null;
          }
          continue;
        }
        return await new SpecContext(tempDirectory).save(downloaded.value.stream, downloaded.value.filename);
      }

      if (await this.fileService.fileExists(inputPath)) {
        return inputPath;
      }
      this.prompts.specFileDoesNotExist();
    }
  }

  /**
   * `adopted` decides what a failure offers. The sample can replace a specification the user
   * named, but not one their project carries: an adopted `spec/` already holds the document the
   * portal would be built from, and nothing here moves the sample into it.
   */
  private async validate(
    specPath: FilePath,
    tempDirectory: DirectoryPath,
    adopted: boolean
  ): Promise<Result<FilePath, ActionResult>> {
    this.prompts.validateSpecStep();
    const validation = await new ValidateAction(this.configDir, this.commandMetadata).execute(specPath, false);

    let checked = specPath;
    if (validation.isFailed()) {
      this.prompts.specValidationFailed();
      if (adopted || !(await this.prompts.useDefaultSpecPrompt())) {
        this.prompts.fixYourSpec();
        return err(ActionResult.cancelled());
      }
      const downloaded = await this.prompts.downloadSpecFile(
        this.fileDownloadService.downloadFile(this.defaultSpecUrl)
      );
      if (downloaded.isErr()) {
        this.prompts.serviceError(downloaded.error);
        return err(ActionResult.failed());
      }
      checked = await new SpecContext(tempDirectory).save(downloaded.value.stream, downloaded.value.filename);
    }

    // The validation above accepts Swagger 2.0, which a portal cannot be built from. Asked
    // here rather than left to `portal serve`, which refuses only once the project is
    // written -- and running the wizard again then rejects the non-empty tree it created.
    const format = await this.specFormat(checked);
    if (!format.supported) {
      if (format.format === null) {
        this.prompts.specNotRecognised(checked);
      } else {
        this.prompts.specFormatUnsupported(checked, format.format);
      }
      return err(ActionResult.failed());
    }
    return ok(checked);
  }

  private async chooseProjectDirectory(): Promise<DirectoryPath | undefined> {
    for (;;) {
      const projectDirectory = await this.prompts.projectDirectoryPrompt();
      if (!projectDirectory) {
        this.prompts.noProjectDirectoryProvided();
        return undefined;
      }

      if (!(await this.fileService.directoryExists(projectDirectory))) {
        this.prompts.projectDirectoryDoesNotExist(projectDirectory);
      } else if (!(await this.fileService.directoryEmpty(projectDirectory))) {
        this.prompts.projectDirectoryNotEmpty(projectDirectory);
      } else {
        return projectDirectory;
      }
    }
  }

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
