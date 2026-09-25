import { SdkQuickstartPrompts } from '../../prompts/sdk/quickstart.js';
import { ActionResult } from '../action-result.js';
import { UrlPath } from '../../types/file/urlPath.js';
import { LoginAction } from '../auth/login.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { getAuthInfo } from '../../client-utils/auth-manager.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { FilePath } from '../../types/file/filePath.js';
import { SpecContext } from '../../types/spec-context.js';
import { ValidateAction } from '../api/validate.js';
import { FileDownloadService } from '../../infrastructure/services/file-download-service.js';
import { FileService } from '../../infrastructure/file-service.js';
import { GenerateAction } from './generate.js';
import { CodegenOption, Language, mapLanguages } from '../../types/sdk/generate.js';
import { LauncherService } from '../../infrastructure/launcher-service.js';
import { ZipService } from '../../infrastructure/zip-service.js';
import { FileName } from '../../types/file/fileName.js';
import { FeaturesToRemove, ValidationService } from '../../infrastructure/services/validation-service.js';
import { ApiService } from '../../infrastructure/services/api-service.js';

export class SdkQuickstartAction {
  private readonly prompts = new SdkQuickstartPrompts();
  private readonly fileDownloadService = new FileDownloadService();
  private readonly fileService = new FileService();
  private readonly launcherService = new LauncherService();
  private readonly zipService = new ZipService();
  private readonly apiService = new ApiService();
  private readonly validationService: ValidationService;
  private readonly metadataFileUrl = new UrlPath(
    `https://raw.githubusercontent.com/apimatic/sample-docs-as-code-portal/refs/heads/v2/src/spec/APIMATIC-META.json`
  );
  private readonly defaultSpecUrl = new UrlPath(
    `https://raw.githubusercontent.com/apimatic/sample-docs-as-code-portal/refs/heads/v2/src/spec/petstore.json`
  );

  constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {
    this.validationService = new ValidationService(configDir);
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
      // gates the free-plan exit below and feeds the language step the allowed SDK
      // languages. A lookup failure is fatal.
      const accountInfo = await this.apiService.getAccountInfo(this.configDir, this.commandMetadata.shell, null);
      if (accountInfo.isErr()) {
        this.prompts.accountInfoFetchFailed(accountInfo.error);
        return ActionResult.failed();
      }
      // An SDK needs a language; with none on the plan (e.g. the free plan) there's
      // nothing to generate, so stop before importing or pruning a spec.
      if (mapLanguages(accountInfo.value.allowedLanguages).length === 0) {
        this.prompts.noLanguagesAvailableOnPlan();
        return ActionResult.cancelled();
      }
      // Step 1/4
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
          // Without this the run carries on and generates an SDK from a document that
          // validation has already rejected.
          this.prompts.serviceError(downloadFileResult.error);
          return ActionResult.failed();
        }
        const specContext = new SpecContext(tempDirectory);
        specPath = await specContext.save(downloadFileResult.value.stream, downloadFileResult.value.filename);
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
      this.prompts.selectLanguageStep();
      const language = await this.prompts.selectLanguagePrompt(mapLanguages(accountInfo.value.allowedLanguages));
      if (!language) {
        this.prompts.noLanguageSelected();
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

      // Setup build directory with the spec folder
      const apimaticMetaFile = await this.prompts.downloadMetadataFile(
        this.fileDownloadService.downloadFile(this.metadataFileUrl)
      );
      if (apimaticMetaFile.isErr()) {
        this.prompts.serviceError(apimaticMetaFile.error);
        return ActionResult.failed();
      }
      const tempSpecDirectory = tempDirectory.join('spec');
      await this.fileService.createDirectoryIfNotExists(tempSpecDirectory);
      const metadataFilePath = new FilePath(tempSpecDirectory, apimaticMetaFile.value.filename);
      await this.fileService.writeFile(metadataFilePath, apimaticMetaFile.value.stream);

      if (await this.fileService.isZipFile(specPath)) {
        await this.zipService.unArchive(specPath, tempSpecDirectory);
      } else {
        await this.fileService.copyToDir(specPath, tempSpecDirectory);
      }

      const buildDirectory = inputDirectory.join('src');
      const specDirectory = buildDirectory.join('spec');
      await this.fileService.copyDirectoryContents(tempSpecDirectory, specDirectory);

      const buildDirectoryStructure = await this.fileService.getDirectory(buildDirectory);
      this.prompts.printDirectoryStructure(inputDirectory, buildDirectoryStructure);

      const sdkDirectory = inputDirectory.join('sdk');
      const sdkGenerateAction = new GenerateAction(this.configDir, this.commandMetadata);
      const result = await sdkGenerateAction.execute(
        buildDirectory,
        sdkDirectory,
        language as Language,
        true,
        false,
        false,
        false,
        CodegenOption.v3,
        false
      );
      if (result.isFailed()) {
        return ActionResult.failed();
      }

      const languageDirectory = sdkDirectory.join(language);
      const readmeFilePath = new FilePath(languageDirectory, new FileName('README.md'));
      if (await this.launcherService.openFolderInIde(languageDirectory, readmeFilePath)) {
        this.prompts.sdkOpenedInEditor();
      }

      this.prompts.nextSteps(language, inputDirectory);
      return ActionResult.success();
    });
  };
}
