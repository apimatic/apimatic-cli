import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { PortalServePrompts } from '../../../src/prompts/portal/serve.js';
import {
  reportFolderTabs,
  reportShadowedFiles,
  reportSharedTabNames,
  reportSourceProblem
} from '../../../src/prompts/portal/source.js';
import { ContentProblem } from '../../../src/types/portal/portal-source.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { PLUGIN_SECTION, SDK_SECTION } from '../../../src/types/portal/generated-pages.js';

describe('reportSourceProblem', () => {
  const source = new DirectoryPath('project').join('src');
  let error: sinon.SinonStub;
  let message: sinon.SinonStub;

  // Without its colours, which picocolors adds on Windows and in CI whatever the terminal.
  const printed = () =>
    [...error.getCalls(), ...message.getCalls()]
      .map((call) => stripVTControlCharacters(String(call.args[0])))
      .join('\n');

  /** A source refused for these problems in `content/`. */
  const reportContent = (...problems: ContentProblem[]) =>
    reportSourceProblem({ kind: 'invalidContent', problems }, source);

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

  describe('a spec directory the portal reads no document from', () => {
    const spec = source.join('spec');
    const conversion = (format: string | null, others = 0) => ({
      file: new FilePath(spec, new FileName('petstore.json')),
      format,
      converted: new FilePath(spec.join('transformations'), new FileName('petstore_OpenApi3Yaml.yaml')),
      others
    });

    // The command alone wrote into a folder the portal does not read, which left the user stuck.
    it('gives the whole conversion: the command for the document, and the file to move up', () => {
      reportSourceProblem({ kind: 'noOpenApiSpec', conversion: conversion('Swagger 2.0') }, source);

      expect(printed()).to.contain("'petstore.json' is Swagger 2.0.");
      expect(printed()).to.contain(
        'apimatic api transform --format=openapi3yaml --file=./project/src/spec/petstore.json ' +
          '--destination=./project/src/spec'
      );
      expect(printed()).to.contain("then move './project/src/spec/transformations/petstore_OpenApi3Yaml.yaml' up into");
      expect(printed()).to.not.contain('the same way');
    });

    it('hedges for a document that says nothing of its format, and counts the others', () => {
      reportSourceProblem({ kind: 'noOpenApiSpec', conversion: conversion(null, 2) }, source);

      expect(printed()).to.contain("If 'petstore.json' is an API definition in another format, convert it with:");
      expect(printed()).to.contain('Convert the other 2 documents the same way.');
    });

    it('says a document in a folder of it is not read', () => {
      reportSourceProblem({ kind: 'emptySpecDirectory', folders: [spec.join('transformations')] }, source);

      expect(printed()).to.contain("such as 'transformations', is not read: move it up.");
    });
  });

  describe('a page at an address kept for the generated pages', () => {
    const content = source.join('content');

    it('names the page, where it would be served, and what the address is kept for', () => {
      reportContent({
        kind: 'reservedAddresses',
        pages: [
          {
            file: new FilePath(content.join('(intro)'), new FileName('sdks.md')),
            address: '/sdks',
            section: SDK_SECTION
          }
        ]
      });

      const [heading, ...rest] = printed().split('\n');

      expect(heading).to.match(/^A page in .+ would be served where the portal puts the pages it generates:$/);
      expect(rest).to.deep.equal([
        "  • 'content/(intro)/sdks.md', at '/sdks', which is kept for the SDK pages",
        'Rename or move the page.'
      ]);
    });

    it('says which section a deeper page falls under, for every page and section', () => {
      reportContent({
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
      });

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

  it('lists each page whose front matter the build would refuse, and shows front matter that works', () => {
    reportContent({
      kind: 'invalidFrontMatter',
      errors: [
        'content/notes.md has no front matter, which is where its title goes.',
        "content/faq.md: 'title' must not be empty."
      ]
    });

    const [heading, ...rest] = printed().split('\n');

    expect(heading).to.match(/^The front matter of pages in .+ would fail the build:$/);
    expect(rest).to.deep.equal([
      '  • content/notes.md has no front matter, which is where its title goes.',
      "  • content/faq.md: 'title' must not be empty.",
      'Start each page with front matter that gives its title, for example:',
      '---',
      'title: Getting started',
      '---'
    ]);
  });

  it('names a page named like a (group) folder, and why it cannot be served', () => {
    reportContent({
      kind: 'groupNamedPages',
      pages: [new FilePath(source.join('content'), new FileName('(intro).md'))]
    });

    expect(printed()).to.equal(
      "'content/(intro).md' is named like a '(group)' folder, which is left out of every address, so the " +
        'build cannot serve it. Rename the file.'
    );
  });

  describe('pages at the same address', () => {
    const content = source.join('content');
    const page = (directory: DirectoryPath, name: string) => new FilePath(directory, new FileName(name));

    it('names each address and its pages, and why a (group) or index page lands there', () => {
      reportContent({
        kind: 'sharedAddresses',
        addresses: [
          { address: '/guides', pages: [page(content, 'guides.md'), page(content.join('guides'), 'index.md')] },
          { address: '/', pages: [page(content, 'index.md'), page(content.join('(start)'), 'index.md')] }
        ]
      });

      const [heading, ...rest] = printed().split('\n');

      expect(heading).to.match(/^Pages in .+ would share addresses, but only one page can be served at each:$/);
      expect(rest).to.deep.equal([
        "  • '/guides': 'content/guides.md' and 'content/guides/index.md'",
        "  • '/': 'content/index.md' and 'content/(start)/index.md'",
        "Rename or move all but one page at each address. A page in a '(group)' folder is served as if the " +
          "folder were not there, and an 'index' page at its folder's address."
      ]);
    });

    it('speaks of one address when there is one', () => {
      reportContent({
        kind: 'sharedAddresses',
        addresses: [{ address: '/faq', pages: [page(content, 'faq.md'), page(content, 'faq.mdx')] }]
      });

      expect(printed()).to.contain('would share an address, but only one page can be served at each:');
      expect(printed()).to.contain('Rename or move all but one of them.');
    });
  });

  it('reports every problem in the content, one after another', () => {
    reportContent(
      { kind: 'invalidFrontMatter', errors: ['content/notes.md has no front matter, which is where its title goes.'] },
      { kind: 'invalidNavigation', errors: ["content/nav.json: 'missing' is not a page or folder in this directory."] }
    );

    const headings = error.getCalls().map((call) => stripVTControlCharacters(String(call.args[0])));
    expect(headings).to.have.lengthOf(2);
    expect(headings[0]).to.match(/^The front matter of pages in .+ would fail the build:$/);
    expect(headings[1]).to.match(/^The page order in .+ could not be applied:$/);
    expect(printed()).to.contain("  • content/nav.json: 'missing' is not a page or folder in this directory.");
  });
});

describe('reportShadowedFiles', () => {
  let warn: sinon.SinonStub;

  beforeEach(() => {
    warn = sinon.stub(log, 'warn');
  });

  afterEach(() => {
    sinon.restore();
  });

  const printed = () => stripVTControlCharacters(String(warn.firstCall.args[0]));

  it('names one file that replaces a generated one', () => {
    reportShadowedFiles([new FileName('robots.txt')]);

    expect(printed()).to.equal("'robots.txt' in 'static' replaces the file the portal would have generated.");
  });

  it('lists the files that replace generated ones as a sentence would', () => {
    reportShadowedFiles([new FileName('robots.txt'), new FileName('sitemap.xml'), new FileName('llms.txt')]);

    expect(printed()).to.equal(
      "'robots.txt', 'sitemap.xml' and 'llms.txt' in 'static' replace the files the portal would have generated."
    );
  });
});

describe('reportFolderTabs', () => {
  let info: sinon.SinonStub;

  beforeEach(() => {
    info = sinon.stub(log, 'info');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('says nothing when the root nav.json lists no folder', () => {
    reportFolderTabs([]);

    expect(info.called).to.be.false;
  });

  // Listing a folder is all it takes to make a tab, so the output names each one it made.
  it('names each folder the root nav.json makes a tab of, in its order', () => {
    const content = new DirectoryPath('project', 'src', 'content');
    reportFolderTabs([content.join('tutorials'), content.join('guides')]);

    expect(stripVTControlCharacters(String(info.firstCall.args[0]))).to.equal(
      "'content/nav.json' makes a tab of each folder it lists: 'tutorials' and 'guides'."
    );
  });
});

describe('reportSharedTabNames', () => {
  const source = new DirectoryPath('project').join('src');
  const content = source.join('content');
  const guidesNavigation = new FilePath(content.join('guides'), new FileName('nav.json'));
  let lines: string[];

  const printed = () => lines.join('\n');

  beforeEach(() => {
    lines = [];
    const record = (text?: string | string[]) => {
      lines.push(stripVTControlCharacters(String(text)));
    };
    sinon.stub(log, 'warn').callsFake(record);
    sinon.stub(log, 'message').callsFake(record);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('says nothing when no two tabs share a name', () => {
    reportSharedTabNames([], source);

    expect(printed()).to.equal('');
  });

  it('gives each spelling of a name that differs only in case', () => {
    reportSharedTabNames(
      [
        {
          name: 'guides',
          tabs: [
            { owner: { kind: 'home' }, name: 'guides', namedBy: new FilePath(content, new FileName('nav.json')) },
            { owner: { kind: 'folder', directory: content.join('guides') }, name: 'Guides', namedBy: guidesNavigation }
          ]
        }
      ],
      source
    );

    expect(printed()).to.contain(
      "  • 'guides' and 'Guides': the Home tab (titled in 'content/nav.json') and the tab of the 'guides' folder"
    );
  });

  it('names each tab by what gives it the name, and says how to rename it', () => {
    reportSharedTabNames(
      [
        {
          name: 'Guides',
          tabs: [
            { owner: { kind: 'home' }, name: 'Guides', namedBy: new FilePath(content, new FileName('nav.json')) },
            { owner: { kind: 'folder', directory: content.join('guides') }, name: 'Guides', namedBy: guidesNavigation },
            {
              owner: { kind: 'apiReference' },
              name: 'Guides',
              namedBy: new FilePath(content.join('api'), new FileName('index.md'))
            }
          ]
        },
        {
          name: 'SDKs',
          tabs: [
            {
              owner: { kind: 'folder', directory: content.join('sdk-docs') },
              name: 'SDKs',
              namedBy: new FilePath(content.join('sdk-docs'), new FileName('index.md'))
            },
            { owner: { kind: 'generated', section: SDK_SECTION }, name: 'SDKs', namedBy: null }
          ]
        },
        {
          name: 'Home',
          tabs: [
            { owner: { kind: 'home' }, name: 'Home', namedBy: null },
            {
              owner: { kind: 'folder', directory: content.join('home') },
              name: 'Home',
              namedBy: null
            }
          ]
        }
      ],
      source
    );

    expect(printed().split('\n')).to.deep.equal([
      'More than one tab has the same name, or one that differs only in case, so readers cannot tell them apart:',
      "  • 'Guides': the Home tab (titled in 'content/nav.json'), the tab of the 'guides' folder (titled in " +
        "'content/guides/nav.json') and the API reference (titled in 'content/api/index.md')",
      "  • 'SDKs': the tab of the 'sdk-docs' folder (titled in 'content/sdk-docs/index.md') and the tab of the " +
        'SDK pages',
      "  • 'Home': the Home tab and the tab of the 'home' folder (named after the folder)",
      "Rename all but one tab of each name with a 'title' in its folder's 'nav.json', or in " +
        "'content/nav.json' for the Home tab; the tabs of the SDK pages and the context plugin keep their names."
    ]);
  });
});
