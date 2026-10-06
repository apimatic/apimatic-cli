import { Result } from 'neverthrow';
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
import { OpenApiDocument, SpecFormat } from '../types/portal/openapi-document.js';
import { PortalScaffoldProblem } from '../types/portal/portal-source.js';
import { PortalAuthorizationService } from '../infrastructure/services/portal-authorization-service.js';
import { PortalProjectService } from '../infrastructure/portal-project-service.js';
import { APIMATIC_SCHEMA_URL } from '../types/apimatic-config/document.js';
import { PLACEHOLDER_METADATA } from '../types/plugin/plugin-config.js';
import { ProjectContext } from '../types/project-context.js';
import { ResourceContext } from '../types/resource-context.js';
import { DEFAULT_PORTAL_PORT, PortalServeAction } from './portal/serve.js';

export class QuickstartAction {
  private readonly prompts: QuickstartPrompts = new QuickstartPrompts();
  private readonly fileService: FileService = new FileService();
  private readonly authorizationService = new PortalAuthorizationService();
  private readonly projectService = new PortalProjectService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly defaultSpecUrl = new UrlPath(
    `https://raw.githubusercontent.com/apimatic/sample-docs-as-code-portal/refs/heads/v2/src/spec/openapi.json`
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

    return await withDirPath<ActionResult>(async (tempDirectory: DirectoryPath) => {
      const here = ProjectContext.in(workingDirectory);
      return (await here.specsExist())
        ? await this.adoptProject(here, workingDirectory)
        : await this.startProject(tempDirectory);
    });
  };

  // A build downloaded from the platform arrives with its specification in `src/spec/`, so it is not asked for again.
  private async adoptProject(project: ProjectContext, projectDirectory: DirectoryPath): Promise<ActionResult> {
    const sourceDirectory = project.sourceDirectory();
    if (!(await project.config().exists())) {
      this.prompts.configMissing(sourceDirectory);
      return ActionResult.failed();
    }

    this.prompts.importSpecStepAdopted(sourceDirectory);
    this.prompts.validateSpecStep();
    const failure = (await new ValidateAction(this.configDir, this.commandMetadata).execute(project, false)).getError();
    if (failure === 'unchecked') {
      return ActionResult.failed();
    }
    // No sample is offered: nothing here moves it into a `spec/` the project already fills.
    if (failure === 'invalid') {
      this.prompts.specValidationFailed('project');
      this.prompts.fixYourSpec();
      return ActionResult.cancelled();
    }

    const portalSource = project.portalSource();
    const specs = await portalSource.resolveSpecs();
    if (specs.isErr()) {
      this.prompts.specsUnsupported(specs.error, sourceDirectory);
      return ActionResult.failed();
    }

    this.prompts.createPortalStep();
    const scaffolded = await portalSource.adopt(APIMATIC_SCHEMA_URL);
    return await this.completeProject(project, projectDirectory, scaffolded);
  }

  private async startProject(tempDirectory: DirectoryPath): Promise<ActionResult> {
    this.prompts.importSpecStep();
    // Dropped once the CLI's own sample has failed: re-offering the address the user just
    // watched fail, pre-filled, is the one suggestion that cannot work.
    let sampleUrl: UrlPath | null = this.defaultSpecUrl;
    let spec: ResourceContext;
    for (;;) {
      const input = await this.prompts.specPathPrompt(sampleUrl);
      if (!input) {
        this.prompts.noSpecSpecified();
        return ActionResult.cancelled();
      }
      const resolving = ResourceContext.resolveTo(input, tempDirectory.join('user-spec'));
      const resolved = input instanceof UrlPath ? await this.prompts.downloadSpecFile(resolving) : await resolving;
      if (resolved.isOk()) {
        spec = resolved.value;
        break;
      }
      this.prompts.specUnavailable(resolved.error);
      if (resolved.error.kind === 'downloadFailed' && sampleUrl?.isEqual(resolved.error.url)) {
        sampleUrl = null;
      }
    }

    this.prompts.validateSpecStep();
    const failure = (await new ValidateAction(this.configDir, this.commandMetadata).execute(spec, false)).getError();
    // The service's own error is already on screen; the spec may be valid, so there is nothing to fix.
    if (failure === 'unchecked') {
      return ActionResult.failed();
    }
    if (failure === 'invalid') {
      this.prompts.specValidationFailed(spec.kind());
      if (!(await this.prompts.useDefaultSpecPrompt())) {
        this.prompts.fixYourSpec();
        return ActionResult.cancelled();
      }
      const sample = await this.prompts.downloadSpecFile(
        ResourceContext.resolveTo(this.defaultSpecUrl, tempDirectory.join('sample'))
      );
      if (sample.isErr()) {
        this.prompts.specUnavailable(sample.error);
        return ActionResult.failed();
      }
      spec = sample.value;
    }
    const specFile = spec.file();

    // The validation above accepts Swagger 2.0, which a portal cannot be built from. Asked
    // here rather than left to `portal serve`, which refuses only once the project is
    // written -- and running the wizard again then rejects the non-empty tree it created.
    const format = await this.specFormat(specFile);
    if (!format.supported) {
      if (format.format === null) {
        this.prompts.specNotRecognised(specFile);
      } else {
        this.prompts.specFormatUnsupported(specFile, format.format);
      }
      return ActionResult.failed();
    }

    this.prompts.createPortalStep();
    const projectDirectory = await this.chooseProjectDirectory();
    if (projectDirectory === undefined) {
      return ActionResult.cancelled();
    }
    const project = ProjectContext.in(projectDirectory);
    const scaffolded = await project.portalSource().scaffold(specFile, APIMATIC_SCHEMA_URL);
    return await this.completeProject(project, projectDirectory, scaffolded);
  }

  private async completeProject(
    project: ProjectContext,
    projectDirectory: DirectoryPath,
    scaffolded: Result<FilePath, PortalScaffoldProblem>
  ): Promise<ActionResult> {
    const sourceDirectory = project.sourceDirectory();
    if (scaffolded.isErr()) {
      this.prompts.scaffoldFailed(scaffolded.error, sourceDirectory);
      return ActionResult.failed();
    }

    const selection = await this.prompts.selectLanguages();
    if (!selection?.length) {
      this.prompts.noLanguagesSelected();
      return ActionResult.cancelled();
    }

    const pluginConfig = project.pluginConfig();
    const languagesRecorded = await pluginConfig.recordLanguages(selection);
    const pluginConfigRecorded = languagesRecorded.isErr()
      ? languagesRecorded
      : await pluginConfig.upsertMetadata(PLACEHOLDER_METADATA);
    if (pluginConfigRecorded.isErr()) {
      this.prompts.configNotWritten(pluginConfigRecorded.error, sourceDirectory);
      return ActionResult.failed();
    }

    // Reported rather than fatal: what Git tracks does not decide whether a portal can be built.
    const ignored = await project.upsertGitignore();
    if (ignored.isErr()) {
      this.prompts.gitignoreNotUpdated(ignored.error, projectDirectory);
    }

    const structure = await this.fileService.getDirectory(sourceDirectory);
    this.prompts.printDirectoryStructure(projectDirectory, structure);

    const result = await new PortalServeAction(this.configDir, this.commandMetadata, null).execute(
      project,
      DEFAULT_PORTAL_PORT,
      true,
      () => this.prompts.nextSteps(scaffolded.value)
    );

    return result.isFailed() ? ActionResult.failed() : ActionResult.success();
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
