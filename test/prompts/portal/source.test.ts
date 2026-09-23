import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { PortalServePrompts } from '../../../src/prompts/portal/serve.js';
import { reportSourceProblem } from '../../../src/prompts/portal/source.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';

describe('reportSourceProblem', () => {
  const source = new DirectoryPath('project').join('src');
  let error: sinon.SinonStub;
  let message: sinon.SinonStub;

  /** Everything printed, in order, colours and all. */
  const printed = () => [...error.getCalls(), ...message.getCalls()].map((call) => String(call.args[0])).join('\n');

  beforeEach(() => {
    error = sinon.stub(log, 'error');
    message = sinon.stub(log, 'message');
    sinon.stub(log, 'warn');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('points at quickstart for a directory with no apimatic.json', () => {
    reportSourceProblem({ kind: 'missingConfig' }, source);

    expect(printed()).to.contain('quickstart');
  });

  // Quickstart refuses a directory that is not empty, which a running preview's is.
  it('does not point at quickstart for a file removed while the preview runs', () => {
    new PortalServePrompts().configRejected({ kind: 'missingConfig' }, source);
    new PortalServePrompts().configRejected(
      { kind: 'invalidConfig', errors: ["'portal' is required."], missingPortal: true },
      source
    );

    expect(printed()).to.not.contain('quickstart');
  });

  it('names a file spelt in another case on disk, and why that matters', () => {
    const images = source.join('static').join('images');
    reportSourceProblem(
      {
        kind: 'missingStaticFiles',
        files: [
          {
            setting: 'portal.brand.logo',
            file: new FilePath(source.join('static').join('Images'), new FileName('Logo.PNG')),
            foundAs: new FilePath(images, new FileName('logo.png'))
          }
        ]
      },
      source
    );

    expect(printed()).to.contain("'static/Images/Logo.PNG'");
    expect(printed()).to.contain("which is spelt '");
    expect(printed()).to.contain("static/images/logo.png'");
    expect(printed()).to.contain('Names are matched exactly');
  });

  it('says nothing of spelling for a file that is not there at all', () => {
    reportSourceProblem(
      {
        kind: 'missingStaticFiles',
        files: [
          {
            setting: 'portal.brand.favicon',
            file: new FilePath(source.join('static'), new FileName('favicon.ico')),
            foundAs: null
          }
        ]
      },
      source
    );

    expect(printed()).to.contain("'static/favicon.ico'");
    expect(printed()).to.not.contain('spelt');
  });
});
