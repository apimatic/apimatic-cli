import { getAuthInfo } from '../../client-utils/auth-manager.js';
import { FileService } from '../../infrastructure/file-service.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { ZipService } from '../../infrastructure/zip-service.js';
import { PortalQuickstartPrompts } from '../../prompts/portal/quickstart.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { UrlPath } from '../../types/file/urlPath.js';
import { LoginAction } from '../auth/login.js';
import { ActionResult } from '../action-result.js';
import { PortalServeAction } from './serve.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { ValidateAction } from '../api/validate.js';
import { BuildContext } from '../../types/build-context.js';
import { TempContext } from '../../types/temp-context.js';
import { FileDownloadService } from '../../infrastructure/services/file-download-service.js';
import { FilePath } from '../../types/file/filePath.js';
import { SpecContext } from '../../types/spec-context.js';
import { FeaturesToRemove, ValidationService } from '../../infrastructure/services/validation-service.js';
import { FileName } from '../../types/file/fileName.js';
import { ApiService } from '../../infrastructure/services/api-service.js';
import { DEFAULT_COPILOT_WELCOME_MESSAGE } from './copilot.js';
import { mapLanguages } from '../../types/sdk/generate.js';

const defaultPort: number = 23513 as const;
const defaultBaseUrl = new UrlPath(`http://localhost:${defaultPort}`);

export class PortalQuickstartAction {
  private readonly prompts: PortalQuickstartPrompts = new PortalQuickstartPrompts();
  private readonly zipService: ZipService = new ZipService();
  private readonly fileService: FileService = new FileService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly fileDownloadService = new FileDownloadService();
  private readonly apiService = new ApiService();
  private readonly buildFileUrl = new UrlPath(
    `https://github.com/apimatic/sample-docs-as-code-portal/archive/refs/heads/master.zip`
  );
  private readonly defaultSpecUrl = new UrlPath(
    `https://raw.githubusercontent.com/apimatic/sample-docs-as-code-portal/refs/heads/master/src/spec/openapi.json`
  );
  private readonly repositoryFolderName = 'sample-docs-as-code-portal-master/src' as const;
  private readonly validationService: ValidationService;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.validationService = new ValidationService(this.configDir);
  }

  public readonly execute = async (): Promise<ActionResult> => {
    const storedAuth = await getAuthInfo(this.configDir.toString());
    if (!storedAuth?.authKey) {
      const loginResult = await new LoginAction(this.configDir, this.commandMetadata).execute();
      if (loginResult.isFailed()) {
        return ActionResult.failed();
      }
    }

    return await withDirPath<ActionResult>(async (tempDirectory: DirectoryPath): Promise<ActionResult> => {
      // Fetch account info before anything else so the plan is known up front: it
      // gates the free-plan exit below, feeds the language step the allowed SDK
      // languages, and resolves the API Copilot key later. A lookup failure is fatal.
      const accountInfo = await this.apiService.getAccountInfo(this.configDir, this.commandMetadata.shell, null);
      if (accountInfo.isErr()) {
        this.prompts.accountInfoFetchFailed(accountInfo.error);
        return ActionResult.failed();
      }
      const allowedLanguages = mapLanguages(accountInfo.value.allowedLanguages);
      // Quickstart builds a portal around SDKs; with no SDK languages on the plan
      // (e.g. the free plan) there's nothing to generate, so stop before importing
      // or pruning a spec.
      if (allowedLanguages.length === 0) {
        this.prompts.noLanguagesAvailableOnPlan();
        return ActionResult.cancelled();
      }

      // Step 1/4
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

      // Step 2/4
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
        } else {
          const specContext = new SpecContext(tempDirectory);
          specPath = await specContext.save(downloadFileResult.value.stream, downloadFileResult.value.filename);
        }
      }

      if (validationResult.isSuccess()) {
        const unallowed = validationResult.getValue();
        if (unallowed && (unallowed.Features?.length > 0 || unallowed.EndpointCount > unallowed.EndpointLimit)) {
          const config: FeaturesToRemove = {
            features: unallowed.Features.filter((name) => !!name),
            endpointsToKeep: unallowed.EndpointLimit
          };

          const stripUnallowedFeaturesResult = await this.validationService.stripUnallowedFeatures(specPath, config);
          if (stripUnallowedFeaturesResult.isErr()) {
            this.prompts.splitSpecDetected(unallowed);
            return ActionResult.failed();
          } else {
            this.prompts.stripUnallowedFeaturesStep(unallowed);
            const specContext = new SpecContext(tempDirectory);
            specPath = await specContext.save(stripUnallowedFeaturesResult.value, new FileName('pruned-spec.zip'));
          }
        }
      }

      // Step 3/4
      this.prompts.selectLanguagesStep();
      const languages = await this.prompts.selectLanguagesPrompt(allowedLanguages);
      if (!languages) {
        this.prompts.noLanguagesSelected();
        return ActionResult.cancelled();
      }

      // Step 4/4
      this.prompts.selectInputDirectoryStep();
      let inputDirectory: DirectoryPath | undefined;
      while (true) {
        inputDirectory = await this.prompts.inputDirectoryPathPrompt();
        if (!inputDirectory) {
          this.prompts.noInputDirectoryProvided();
          return ActionResult.cancelled();
        }

        if (!(await this.fileService.directoryExists(inputDirectory))) {
          this.prompts.inputDirectoryPathDoesNotExist(inputDirectory);
          // TODO: Prompt user if he wants to create the directory
          continue;
        }

        if (!(await this.fileService.directoryEmpty(inputDirectory))) {
          this.prompts.inputDirectoryNotEmpty(inputDirectory);
          continue;
        }
        break;
      }

      // Resolve the API Copilot key to enable, if any, before setting up the source
      // directory. An account with no key continues silently (no Copilot); cancelling
      // the multi-key selection aborts quickstart. (Account info was already fetched
      // above for the language step.) Whether Copilot is actually on the plan is only
      // known after the prune below, so the "enabled" caution is deferred until then.
      let copilotKey: string | undefined;
      const copilotKeys = accountInfo.value.ApiCopilotKeys ?? [];
      if (copilotKeys.length === 1) {
        copilotKey = copilotKeys[0];
      } else if (copilotKeys.length > 1) {
        copilotKey = await this.prompts.selectCopilotKey(copilotKeys);
        if (!copilotKey) {
          this.prompts.noCopilotKeySelected();
          return ActionResult.cancelled();
        }
      }

      const masterBuildFile = await this.prompts.downloadBuildDirectory(
        this.fileDownloadService.downloadFile(this.buildFileUrl)
      );
      if (masterBuildFile.isErr()) {
        this.prompts.serviceError(masterBuildFile.error);
        return ActionResult.failed();
      }
      const tempContext = new TempContext(tempDirectory);
      const masterBuildFilePath = await tempContext.save(masterBuildFile.value.stream);
      await this.zipService.unArchive(masterBuildFilePath, tempDirectory);
      const extractedFolder = tempDirectory.join(this.repositoryFolderName);

      // Clean up the workflow dir from the template before copying
      const tempBuildContext = new BuildContext(extractedFolder);
      await tempBuildContext.deleteWorkflowDir();

      // Copy the template into the final destination
      const sourceDirectory = inputDirectory.join('src');
      await this.fileService.copyDirectoryContents(extractedFolder, sourceDirectory);

      // Update the build file in its final location via BuildContext,
      // mirroring exactly how CopilotAction reads and writes the build file
      const buildContext = new BuildContext(sourceDirectory);
      const baseConfig = (await buildContext.getBuildFileContents()).withPortalLanguages(languages);
      const buildConfig = copilotKey
        ? baseConfig.withApiCopilotForPortal(copilotKey, DEFAULT_COPILOT_WELCOME_MESSAGE, defaultBaseUrl)
        : baseConfig;
      await buildContext.updateBuildFileContents(buildConfig);

      // Prune the build file to what the plan allows (SDK languages + AI features)
      // before serving. Fail closed: a prune failure aborts rather than serving a
      // build the plan can't generate.
      const pruneResult = await this.validationService.pruneBuildFile(buildContext.buildFilePath());
      if (pruneResult.isErr()) {
        this.prompts.serviceError(pruneResult.error);
        return ActionResult.failed();
      }
      const { buildFile: prunedConfig, report } = pruneResult.value;
      await buildContext.updateBuildFileContents(prunedConfig);
      this.prompts.buildFilePruned(report);

      // Only surface the Copilot caution if Copilot survived the prune — i.e. it's
      // actually on the plan. If it was stripped, buildFilePruned already reported it.
      if (prunedConfig.hasApiCopilot() && copilotKey) {
        this.prompts.copilotEnabled(copilotKey);
      }

      const specDirectory = sourceDirectory.join('spec');
      const specContext = new SpecContext(specDirectory);
      await specContext.replaceDefaultSpec(specPath);

      const buildDirectoryStructure = await this.fileService.getDirectory(sourceDirectory);
      this.prompts.printDirectoryStructure(inputDirectory, buildDirectoryStructure);

      const portalDirectory = inputDirectory.join('portal');
      const portalServeAction = new PortalServeAction(this.configDir, this.commandMetadata, null);
      const result = await portalServeAction.execute(sourceDirectory, portalDirectory, defaultPort, true, false, () => {
        this.prompts.nextSteps();
      });

      if (result.isFailed()) {
        return ActionResult.failed();
      }

      return ActionResult.success();
    });
  };
}