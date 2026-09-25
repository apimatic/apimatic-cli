import { ok } from 'neverthrow';
import sinon from 'sinon';
import { PortalProjectService } from '../../../src/infrastructure/portal-project-service';
import { PortalArtifactsService } from '../../../src/infrastructure/services/portal-artifacts-service';
import { PreparePortalProjectPrompts } from '../../../src/prompts/portal/prepare-project';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { CodeSampleCatalogs } from '../../../src/types/portal/code-samples';
import { PortalArtifacts } from '../../../src/types/portal/portal-artifacts';
import { PORTAL_LANGUAGES } from '../../../src/types/sdk/generate';

export interface PreparePortalProjectStubs {
  prompts: sinon.SinonStubbedInstance<PreparePortalProjectPrompts>;
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

  return {
    prompts,
    artifacts: sinon.stub(PortalArtifactsService.prototype, 'generate').resolves(ok(completeArtifacts())),
    runtimeProblem: sinon.stub(PortalProjectService.prototype, 'runtimeProblem').returns(null),
    prepare: sinon
      .stub(PortalProjectService.prototype, 'prepare')
      .callsFake(async (projectDirectory) =>
        ok({ projectDirectory, viteBinary: new FilePath(projectDirectory, new FileName('vite.js')) })
      )
  };
}
