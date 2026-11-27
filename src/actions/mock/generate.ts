import { StubDirectoryService } from '../../infrastructure/mock/stub-directory-service.js';
import {
  STUB_FILES_IN_DOWNLOAD,
  StubGenerationService
} from '../../infrastructure/services/stub-generation-service.js';
import { withDirPath } from '../../infrastructure/tmp-extensions.js';
import { MockGeneratePrompts } from '../../prompts/mock/generate.js';
import { CommandMetadata } from '../../types/common/command-metadata.js';
import { DirectoryPath } from '../../types/file/directoryPath.js';
import { ProjectContext } from '../../types/project-context.js';
import { StubsContext } from '../../types/stubs-context.js';
import { TempContext } from '../../types/temp-context.js';
import { ActionResult } from '../action-result.js';

export class MockGenerateAction {
  private readonly prompts: MockGeneratePrompts = new MockGeneratePrompts();
  private readonly stubGenerationService: StubGenerationService = new StubGenerationService();
  private readonly stubDirectoryService: StubDirectoryService = new StubDirectoryService();
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public readonly execute = async (
    project: ProjectContext,
    stubsDirectory: DirectoryPath,
    force: boolean
  ): Promise<ActionResult> => {
    const sourceDirectory = project.sourceDirectory();
    // The stubs directory is emptied before the stub files are written, so one holding the source would delete it.
    if (project.isSourceWithin(stubsDirectory)) {
      this.prompts.destinationContainsSource(sourceDirectory, stubsDirectory);
      return ActionResult.failed();
    }
    if (!(await project.sourceExists())) {
      this.prompts.sourceDirectoryDoesNotExist(sourceDirectory);
      return ActionResult.failed();
    }

    const stubsContext = new StubsContext(stubsDirectory);
    if (!force && (await stubsContext.exists()) && !(await this.prompts.overwriteStubs(stubsDirectory))) {
      this.prompts.stubsDirectoryNotEmpty();
      return ActionResult.cancelled();
    }

    return await withDirPath(async (tempDirectory) => {
      const tempContext = new TempContext(tempDirectory);
      const build = await project.buildZip(tempDirectory);
      if (build.isErr()) {
        this.prompts.sourceNotZipped(sourceDirectory, build.error);
        return ActionResult.failed();
      }

      const response = await this.prompts.generateStubs(
        this.stubGenerationService.generateStubs(build.value, this.configDir, this.commandMetadata, this.authKey)
      );
      if (response.isErr()) {
        this.prompts.stubsNotGenerated(response.error);
        return ActionResult.failed();
      }

      const download = await tempContext.unzip(await tempContext.save(response.value));
      if (download.isErr()) {
        this.prompts.downloadNotUnzipped(download.error);
        return ActionResult.failed();
      }

      // Loaded as `mock serve` will load them, while the stubs directory still holds the last set that did.
      const stubFiles = download.value.join(STUB_FILES_IN_DOWNLOAD);
      const loaded = await this.stubDirectoryService.load(stubFiles);
      if (loaded.isErr()) {
        this.prompts.stubProblems(loaded.error, stubFiles, stubsDirectory);
        return ActionResult.failed();
      }
      const stubCount = loaded.value.all.length;
      if (stubCount === 0) {
        this.prompts.noStubsGenerated(stubsDirectory);
        return ActionResult.failed();
      }

      await stubsContext.replaceWith(stubFiles);
      this.prompts.stubsGenerated(stubsDirectory, stubCount);
      return ActionResult.success();
    });
  };
}
