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
import { getLanguagesConfig } from '../../types/build/build.js';
import { FilePath } from '../../types/file/filePath.js';
import { SpecContext } from '../../types/spec-context.js';
import { FeaturesToRemove, ValidationService } from '../../infrastructure/services/validation-service.js';
import { FileName } from '../../types/file/fileName.js';
import { ApiService } from '../../infrastructure/services/api-service.js';
import { BuildConfig, CopilotConfig } from '../../types/build/build.js';
import { DEFAULT_COPILOT_WELCOME_MESSAGE } from './copilot.js';

const defaultPort: number = 23513 as const;
const copilotBaseUrl: string = `http://localhost:${defaultPort}` as const;
// `portalSettings.languageSettings` must be keyed by codegen's SupportedTemplates id
// (codegen resolves the key via `SdkLanguage.FromSupportedTemplate`), NOT by the
// friendly `languageConfig` key. These ids are version-specific in codegen
// (e.g. `php_generic_lib_v2`) — keep in sync with `APIMatic.CodeGen.Common.SdkLanguage`.
// Languages without an entry here (e.g. the synthetic `http`) are skipped: they have
// no SDK template, so codegen cannot resolve them and would throw.
const codegenTemplateIdByLanguage: Readonly<Record<string, string>> = {
  typescript: 'ts_generic_lib',
  csharp: 'cs_net_standard_lib',
  java: 'java_eclipse_jre_lib',
  php: 'php_generic_lib_v2',
  python: 'python_generic_lib',
  ruby: 'ruby_generic_lib',
  go: 'go_generic_lib'
};

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
      const languages = await this.prompts.selectLanguagesPrompt();
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

      const tempBuildContext = new BuildContext(extractedFolder);
      await tempBuildContext.deleteWorkflowDir();

      const buildFile = await tempBuildContext.getBuildFileContents();
      buildFile.generatePortal!.languageConfig = getLanguagesConfig(languages);
      await this.configureApiCopilot(buildFile);
      await tempBuildContext.updateBuildFileContents(buildFile);

      const sourceDirectory = inputDirectory.join('src');
      await this.fileService.copyDirectoryContents(extractedFolder, sourceDirectory);

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

  // When the account has an API Copilot key, wires Copilot into the build config:
  // points the portal base URL at the local serve port, adds the apiCopilotConfig
  // block, and enables AI editor integrations for every configured SDK language.
  // Copilot is opt-in based on account access: when the user has no Copilot key
  // (or the lookup fails) it is skipped silently, never fatal.
  private async configureApiCopilot(buildFile: BuildConfig): Promise<void> {
    const accountInfo = await this.apiService.getAccountInfo(this.configDir, this.commandMetadata.shell, null);
    if (accountInfo.isErr()) {
      return;
    }

    const copilotKeys = accountInfo.value.ApiCopilotKeys ?? [];
    if (copilotKeys.length === 0) {
      return;
    }

    const copilotKey = copilotKeys.length === 1 ? copilotKeys[0] : await this.prompts.selectCopilotKey(copilotKeys);
    if (!copilotKey) {
      return;
    }

    const apiCopilotConfig: CopilotConfig = {
      isEnabled: true,
      key: copilotKey,
      welcomeMessage: DEFAULT_COPILOT_WELCOME_MESSAGE
    };
    buildFile.generatePortal!.baseUrl = copilotBaseUrl;
    buildFile.apiCopilotConfig = apiCopilotConfig;
    this.enableAiIntegrations(buildFile);
  }

  // Enables Cursor, Claude Code and VS Code integrations for every SDK language in
  // the portal's languageConfig, preserving any existing per-language settings.
  // languageSettings is keyed by codegen's SupportedTemplates id (see
  // codegenTemplateIdByLanguage); languages without a known template id are skipped.
  private enableAiIntegrations(buildFile: BuildConfig): void {
    const portalSettings = (buildFile.generatePortal!.portalSettings ??= {});
    const languageSettings = (portalSettings.languageSettings ??= {});

    for (const language of Object.keys(buildFile.generatePortal!.languageConfig)) {
      const templateId = codegenTemplateIdByLanguage[language];
      if (!templateId) {
        continue;
      }
      languageSettings[templateId] = {
        ...languageSettings[templateId],
        aiIntegration: {
          cursor: { isEnabled: true },
          claudeCode: { isEnabled: true },
          vscode: { isEnabled: true }
        }
      };
    }
  }
}
