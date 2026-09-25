import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { PortalServePrompts } from '../../../src/prompts/portal/serve.js';
import { reportBuildDirectoryProblem } from '../../../src/prompts/portal/build-directory.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { PLUGIN_SECTION, SDK_SECTION } from '../../../src/types/portal/generated-pages.js';

describe('reportBuildDirectoryProblem', () => {
  const buildDirectory = new DirectoryPath('project').join('src');
  let error: sinon.SinonStub;
  let message: sinon.SinonStub;

  // Without its colours, which picocolors adds on Windows and in CI whatever the terminal.
  const printed = () =>
    [...error.getCalls(), ...message.getCalls()]
      .map((call) => stripVTControlCharacters(String(call.args[0])))
      .join('\n');

  beforeEach(() => {
    error = sinon.stub(log, 'error');
    message = sinon.stub(log, 'message');
    sinon.stub(log, 'warn');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('points at quickstart for a directory with no apimatic.json', () => {
    reportBuildDirectoryProblem({ kind: 'missingConfig' }, buildDirectory);

    expect(printed()).to.contain('quickstart');
  });

  // Quickstart refuses a directory that is not empty, which a running preview's is.
  it('does not point at quickstart for a file removed while the preview runs', () => {
    new PortalServePrompts().configRejected({ kind: 'missingConfig' }, buildDirectory);
    new PortalServePrompts().configRejected(
      { kind: 'invalidConfig', errors: ["'portal' is required."], missingPortal: true },
      buildDirectory
    );

    expect(printed()).to.not.contain('quickstart');
  });

  it('names a file spelt in another case on disk, and why that matters', () => {
    const images = buildDirectory.join('static').join('images');
    reportBuildDirectoryProblem(
      {
        kind: 'missingStaticFiles',
        files: [
          {
            setting: 'portal.brand.logo',
            file: new FilePath(buildDirectory.join('static').join('Images'), new FileName('Logo.PNG')),
            foundAs: new FilePath(images, new FileName('logo.png'))
          }
        ]
      },
      buildDirectory
    );

    expect(printed()).to.contain("'static/Images/Logo.PNG'");
    expect(printed()).to.contain("which is spelt '");
    expect(printed()).to.contain("static/images/logo.png'");
    expect(printed()).to.contain('Names are matched exactly');
  });

  it('says nothing of spelling for a file that is not there at all', () => {
    reportBuildDirectoryProblem(
      {
        kind: 'missingStaticFiles',
        files: [
          {
            setting: 'portal.brand.favicon',
            file: new FilePath(buildDirectory.join('static'), new FileName('favicon.ico')),
            foundAs: null
          }
        ]
      },
      buildDirectory
    );

    expect(printed()).to.contain("'static/favicon.ico'");
    expect(printed()).to.not.contain('spelt');
  });

  describe('a page at an address kept for the generated pages', () => {
    const content = buildDirectory.join('content');

    it('names the page, where it would be served, and what the address is kept for', () => {
      reportBuildDirectoryProblem(
        {
          kind: 'reservedAddresses',
          pages: [
            {
              file: new FilePath(content.join('(intro)'), new FileName('sdks.md')),
              address: '/sdks',
              section: SDK_SECTION
            }
          ]
        },
        buildDirectory
      );

      const [heading, ...rest] = printed().split('\n');

      expect(heading).to.match(/^A page in .+ would be served where the portal puts the pages it generates:$/);
      expect(rest).to.deep.equal([
        "  • 'content/(intro)/sdks.md', at '/sdks', which is kept for the SDK pages",
        'Rename or move the page.'
      ]);
    });

    it('says which section a deeper page falls under, for every page and section', () => {
      reportBuildDirectoryProblem(
        {
          kind: 'reservedAddresses',
          pages: [
            {
              file: new FilePath(content.join('sdks'), new FileName('setup.md')),
              address: '/sdks/setup',
              section: SDK_SECTION
            },
            {
              file: new FilePath(content, new FileName('context-plugin.mdx')),
              address: '/context-plugin',
              section: PLUGIN_SECTION
            }
          ]
        },
        buildDirectory
      );

      expect(printed()).to.contain('Pages in ');
      expect(printed()).to.contain(
        "  • 'content/sdks/setup.md', at '/sdks/setup', under '/sdks', which is kept for the SDK pages"
      );
      expect(printed()).to.contain(
        "  • 'content/context-plugin.mdx', at '/context-plugin', which is kept for the context plugin page"
      );
      expect(printed()).to.contain('Rename or move each page.');
    });
  });
});
