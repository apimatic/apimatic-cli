import { Readable } from 'stream';
import { ok } from 'neverthrow';
import sinon from 'sinon';
import { PortalProjectService } from '../../../src/infrastructure/portal-project-service';
import { PortalArtifactsService } from '../../../src/infrastructure/services/portal-artifacts-service';
import { PreparePortalProjectPrompts } from '../../../src/prompts/portal/prepare-project';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { PortalArtifactsContext } from '../../../src/types/portal-artifacts-context';
import { PortalArtifacts } from '../../../src/types/portal/portal-artifacts';

export interface PreparePortalProjectStubs {
  prompts: sinon.SinonStubbedInstance<PreparePortalProjectPrompts>;
  service: sinon.SinonStub;
  artifacts: sinon.SinonStub;
  runtimeProblem: sinon.SinonStub;
  prepare: sinon.SinonStub;
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
    service: sinon.stub(PortalArtifactsService.prototype, 'generate').resolves(ok(Readable.from([]))),
    artifacts: sinon.stub(PortalArtifactsContext.prototype, 'unpack').resolves(ok(PortalArtifacts.none())),
    runtimeProblem: sinon.stub(PortalProjectService.prototype, 'runtimeProblem').returns(null),
    prepare: sinon
      .stub(PortalProjectService.prototype, 'prepare')
      .callsFake(async (projectDirectory) =>
        ok({ projectDirectory, viteBinary: new FilePath(projectDirectory, new FileName('vite.js')) })
      )
  };
}
