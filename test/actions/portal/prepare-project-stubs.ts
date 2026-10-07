import { Readable } from 'stream';
import AdmZip from 'adm-zip';
import { ok } from 'neverthrow';
import sinon from 'sinon';
import { ApiValidatePrompts } from '../../../src/prompts/api/validate';
import { ValidationService } from '../../../src/infrastructure/services/validation-service';
import { FileDownloadService } from '../../../src/infrastructure/services/file-download-service';
import { PortalProjectService } from '../../../src/infrastructure/portal-project-service';
import { PortalArtifactsService } from '../../../src/infrastructure/services/portal-artifacts-service';
import { PreparePortalProjectPrompts } from '../../../src/prompts/portal/prepare-project';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { CodeSampleCatalogs } from '../../../src/types/portal/code-samples';
import { PortalArtifacts } from '../../../src/types/portal/portal-artifacts';
import { PORTAL_LANGUAGES } from '../../../src/types/sdk/generate';

export const PASSED = { isSuccess: true, blocking: [], errors: [], warnings: [], information: [] };
/** A failed run with an issue in it, which a summary shown to the user would list. */
export const FAILED = { ...PASSED, isSuccess: false, errors: [{ message: 'Missing response.' }] };
const DEFAULT_META = '{"ValidationConfiguration":{}}';

export interface PreparePortalProjectStubs {
  prompts: sinon.SinonStubbedInstance<PreparePortalProjectPrompts>;
  validate: sinon.SinonStub;
  summary: sinon.SinonStub;
  /** What was in the archive sent for validation, read while it still existed. */
  validatedEntries: () => string[];
  download: sinon.SinonStub;
  artifacts: sinon.SinonStub;
  runtimeProblem: sinon.SinonStub;
  prepare: sinon.SinonStub;
}

/**
 * What a run delivers for a portal with every available language and a plugin, which backs the
 * pages of any fixture. The files are never read: the project service is stubbed wherever these are.
 */
export function completeArtifacts(
  languages: readonly string[] = PORTAL_LANGUAGES,
  { plugin = true, codeSampleCatalogs = new CodeSampleCatalogs([]) } = {}
): PortalArtifacts {
  const delivered = new DirectoryPath('artifacts');
  return new PortalArtifacts(
    codeSampleCatalogs,
    new Map(languages.map((language) => [language, new FilePath(delivered, new FileName(`${language}.zip`))])),
    new Map(languages.map((language) => [language, `## Installation\n\nInstall the ${language} SDK.\n`])),
    plugin ? new FilePath(delivered, new FileName('plugin.zip')) : undefined
  );
}

/**
 * What `PreparePortalProjectAction` reaches for, stubbed the same way for both commands that run
 * it. A test that cares about one of these overrides it afterwards; the defaults are the happy path.
 */
export function stubPreparePortalProject(): PreparePortalProjectStubs {
  const prompts = sinon.stub(PreparePortalProjectPrompts.prototype);
  // The spinner would render to stdout; pass the underlying promise straight through.
  prompts.generateArtifacts.callsFake((fn) => fn);
  prompts.downloadDefaultMeta.callsFake((fn) => fn);
  sinon.stub(ApiValidatePrompts.prototype, 'validateApi').callsFake((fn) => fn);

  let validatedEntries: string[] = [];

  return {
    prompts,
    validate: sinon.stub(ValidationService.prototype, 'validateViaFile').callsFake(async ({ file }) => {
      validatedEntries = new AdmZip(file.toString()).getEntries().map((entry) => entry.entryName);
      return ok({ validation: PASSED, linting: PASSED } as never);
    }),
    validatedEntries: () => validatedEntries,
    summary: sinon.stub(ApiValidatePrompts.prototype, 'displayValidationSummary'),
    download: sinon
      .stub(FileDownloadService.prototype, 'downloadFile')
      .callsFake(async () =>
        ok({ stream: Readable.from([DEFAULT_META]), filename: new FileName('APIMATIC-META.json') })
      ),
    artifacts: sinon.stub(PortalArtifactsService.prototype, 'generate').resolves(ok(completeArtifacts())),
    runtimeProblem: sinon.stub(PortalProjectService.prototype, 'runtimeProblem').returns(null),
    prepare: sinon.stub(PortalProjectService.prototype, 'prepare').callsFake(async (projectDirectory, source) =>
      ok({
        projectDirectory,
        viteBinary: new FilePath(projectDirectory, new FileName('vite.js')),
        contentSource: source.contentDirectory
      })
    )
  };
}
