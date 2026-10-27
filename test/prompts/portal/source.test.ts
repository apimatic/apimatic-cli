import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { PortalServePrompts } from '../../../src/prompts/portal/serve.js';
import {
  reportLeftOutSpecs,
  reportNoTabsListed,
  reportShadowedFiles,
  reportSharedEndpoints,
  reportSharedTabNames,
  reportSourceProblem,
  reportTaggedPages,
  reportUnmergedSpecs,
  reportUnseenHomeTitle
} from '../../../src/prompts/portal/source.js';
import { Endpoint } from '../../../src/types/portal/endpoint.js';
import { ContentProblem, UnreadableSpecReason } from '../../../src/types/portal/portal-source.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { PLUGIN_SECTION, SDK_SECTION } from '../../../src/types/portal/generated-pages.js';
import { OAUTH_CALLBACK } from '../../../src/types/portal/content-tree.js';

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

  describe('images the build cannot find', () => {
    const content = source.join('content');
    const images = source.join('static').join('images');
    const page = new FilePath(content, new FileName('index.md'));

    it('names each by its page and line, with where the build looked and the spelling on disk', () => {
      reportContent({
        kind: 'missingImages',
        images: [
          {
            page,
            line: 4,
            url: '/images/Logo.png',
            missing: {
              file: new FilePath(images, new FileName('Logo.png')),
              foundAs: new FilePath(images, new FileName('logo.png'))
            }
          },
          {
            page,
            line: 6,
            url: './missing.png',
            missing: { file: new FilePath(content, new FileName('missing.png')), foundAs: null }
          },
          { page, line: 8, url: '../secret.png', missing: null }
        ]
      });

      expect(printed()).to.contain(
        "'content/index.md', line 4: '/images/Logo.png', but the file is spelt 'static/images/logo.png' on disk"
      );
      expect(printed()).to.contain(
        "'content/index.md', line 6: './missing.png', but there is no 'content/missing.png'"
      );
      expect(printed()).to.contain("'content/index.md', line 8: '../secret.png' points outside 'content'");
      expect(printed()).to.contain('Names are matched exactly');
    });

    it('says nothing of spelling when no image is there in another case', () => {
      reportContent({
        kind: 'missingImages',
        images: [
          {
            page,
            line: 4,
            url: './missing.png',
            missing: { file: new FilePath(content, new FileName('missing.png')), foundAs: null }
          }
        ]
      });

      expect(printed()).to.contain('there is no');
      expect(printed()).to.not.contain('spelt');
    });
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
      // Left beside its conversion, the original would be a second definition of the API.
      expect(printed()).to.contain(", in place of 'petstore.json'.");
      expect(printed()).to.not.contain('the same way');
    });

    it('hedges for a document that says nothing of its format, and counts the others', () => {
      reportSourceProblem({ kind: 'noOpenApiSpec', conversion: conversion(null, 2) }, source);

      expect(printed()).to.contain("If 'petstore.json' is an API definition in another format, convert it with:");
      expect(printed()).to.contain('Convert the other 2 documents the same way.');
    });

    // A folder to an API is the layout merging needs, so the message cannot only say to undo it.
    it('says a document in a folder of it is not read, and both ways to have it read', () => {
      reportSourceProblem({ kind: 'emptySpecDirectory', folders: [spec.join('alpha'), spec.join('beta')] }, source);

      expect(printed()).to.contain('has no API definition.');
      expect(printed()).to.contain(
        "A document in a folder inside it, such as 'alpha' and 'beta', is not read. Move it up, or to keep one " +
          "API to a folder, set 'MergeConfiguration.MergeApis' to true in an 'APIMATIC-META.json' beside the folders."
      );
    });

    it('names the folder a conversion is for, and moves the result up into that folder', () => {
      const folder = spec.join('orders');
      reportSourceProblem(
        {
          kind: 'noOpenApiSpec',
          conversion: {
            file: new FilePath(folder, new FileName('orders.json')),
            format: 'Swagger 2.0',
            converted: new FilePath(folder.join('transformations'), new FileName('orders_OpenApi3Yaml.yaml')),
            others: 0
          }
        },
        source
      );

      expect(printed()).to.contain(`No OpenAPI 3.x document found in '${folder}'.`);
      expect(printed()).to.contain('--destination=./project/src/spec/orders');
      expect(printed()).to.contain(`up into '${folder}', in place of 'orders.json'.`);
      expect(printed()).to.not.contain('only folder read');
    });

    it('names a document it cannot read by its folder', () => {
      const file = new FilePath(spec.join('orders'), new FileName('openapi.yaml'));
      reportSourceProblem({ kind: 'unreadableSpec', file, referencedBy: null, reason: { kind: 'empty' } }, source);

      expect(printed()).to.equal("'spec/orders/openapi.yaml' could not be read: it is empty.");
    });

    it('names a metadata file it cannot read, which is JSON only', () => {
      reportSourceProblem(
        { kind: 'unreadableMetadata', file: new FilePath(spec, new FileName('APIMATIC-META.json')) },
        source
      );

      expect(printed()).to.equal("'spec/APIMATIC-META.json' could not be read as JSON.");
    });
  });

  describe('folders a metadata file merges that hold nothing to read', () => {
    const spec = source.join('spec');
    const metadata = new FilePath(spec, new FileName('APIMATIC-META.json'));

    it('names an empty folder, and the two ways to put it right', () => {
      reportSourceProblem({ kind: 'emptyMergedFolders', metadata, folders: [spec.join('orders')] }, source);

      expect(printed().split('\n')).to.deep.equal([
        "'spec/APIMATIC-META.json' merges './spec/orders', which holds no API definition.",
        'Add its OpenAPI 3.x document to the top of the folder, or list only the folders to merge in ' +
          "'MergeOrderOfDirectories'."
      ]);
    });

    it('lists several empty folders as a sentence would', () => {
      reportSourceProblem(
        { kind: 'emptyMergedFolders', metadata, folders: [spec.join('orders'), spec.join('apis', 'items')] },
        source
      );

      expect(printed().split('\n')).to.deep.equal([
        "'spec/APIMATIC-META.json' merges './spec/orders' and './spec/apis/items', which hold no API definition.",
        "Add each one's OpenAPI 3.x document to the top of its folder, or list only the folders to merge in " +
          "'MergeOrderOfDirectories'."
      ]);
    });

    // A folder outside `spec/`, or spelt in another case, may well hold a document; the platform still finds none.
    it('names each folder the platform would not find by its path, and how folders are named', () => {
      reportSourceProblem(
        { kind: 'missingMergedFolders', metadata, folders: [spec.join('Orders'), source.join('content'), spec] },
        source
      );

      expect(printed().split('\n')).to.deep.equal([
        `'spec/APIMATIC-META.json' merges './spec/Orders', './content' and './spec', which are not folders inside ` +
          `'${spec}'.`,
        "Name each folder in 'MergeOrderOfDirectories' by its path from the file, spelt as on disk, case included."
      ]);
    });

    it('speaks of one folder the platform would not find when there is one', () => {
      reportSourceProblem({ kind: 'missingMergedFolders', metadata, folders: [spec.join('orderz')] }, source);

      expect(printed()).to.contain("merges './spec/orderz', which is not a folder inside");
    });

    it('names each definition of a merged folder that holds more than one, and where to move the others', () => {
      const orders = spec.join('orders');
      reportSourceProblem(
        {
          kind: 'severalSpecsInFolder',
          folder: orders,
          files: [
            new FilePath(orders, new FileName('components.json')),
            new FilePath(orders, new FileName('orders.json'))
          ]
        },
        source
      );

      expect(printed().split('\n')).to.deep.equal([
        "'spec/orders/components.json' and 'spec/orders/orders.json' are each an API definition, but a folder " +
          "that 'APIMATIC-META.json' merges holds one at its top, and the SDKs are built from one of them only.",
        'Keep the definition there and move each of the others: shared parts into a folder inside it, such as ' +
          "'./spec/orders/shared', and another API into a folder of its own, adding the new folders to " +
          "'MergeOrderOfDirectories' when the file lists folders."
      ]);
    });

    it('says so when the file merges and there is no folder at all', () => {
      reportSourceProblem({ kind: 'noFoldersToMerge', metadata }, source);

      expect(printed().split('\n')).to.deep.equal([
        `'spec/APIMATIC-META.json' merges the folders of '${spec}', which has none.`,
        "Put each API definition in a folder of its own there, or turn off 'MergeApis' in the file."
      ]);
    });
  });

  describe('a file a specification is read from', () => {
    const spec = source.join('spec');
    const api = new FilePath(spec, new FileName('api.yaml'));
    const pet = new FilePath(spec.join('schemas'), new FileName('Pet.json'));

    it('names a document it cannot read, and why, in the words of the parser that refused it', () => {
      const message =
        'Flow sequence in block collection must be sufficiently indented and end with a ] at line 3, column 1';

      reportSourceProblem(
        { kind: 'unreadableSpec', file: api, referencedBy: null, reason: { kind: 'invalid', message } },
        source
      );

      expect(printed()).to.equal(`'spec/api.yaml' could not be read: ${message}.`);
    });

    it('names the file that refers to one it cannot read', () => {
      const message = "Expected ',' or '}' after property value in JSON at position 13 (line 3 column 3)";

      reportSourceProblem(
        { kind: 'unreadableSpec', file: pet, referencedBy: api, reason: { kind: 'invalid', message } },
        source
      );

      expect(printed()).to.equal(
        `'spec/schemas/Pet.json', which 'spec/api.yaml' refers to, could not be read: ${message}.`
      );
    });

    const reasons: [UnreadableSpecReason, string][] = [
      [{ kind: 'empty' }, 'it is empty'],
      [{ kind: 'noValue' }, 'it holds no value'],
      [{ kind: 'noKey' }, 'it is not JSON, and the portal reads YAML only when it holds a key'],
      [{ kind: 'gone' }, 'it is no longer there'],
      [{ kind: 'folder' }, 'it is a folder'],
      [{ kind: 'unopened', message: 'EACCES: permission denied' }, 'EACCES: permission denied']
    ];

    reasons.forEach(([reason, said]) => {
      it(`says why a file could not be read, when it is ${reason.kind}`, () => {
        reportSourceProblem({ kind: 'unreadableSpec', file: api, referencedBy: null, reason }, source);

        expect(printed()).to.equal(`'spec/api.yaml' could not be read: ${said}.`);
      });
    });

    it('names a file referred to that is not there, and where a reference is resolved from', () => {
      reportSourceProblem(
        { kind: 'missingSpecReference', missing: { file: pet, foundAs: null }, referencedBy: api },
        source
      );

      expect(printed()).to.equal(
        "'spec/api.yaml' refers to 'spec/schemas/Pet.json', but there is no such file.\n" +
          "A '$ref' names a file from the folder of the file it is written in."
      );
    });

    it('names a file referred to that is there in another case, as it is spelt', () => {
      const lowerCase = new FilePath(spec.join('schemas'), new FileName('pet.json'));

      reportSourceProblem(
        { kind: 'missingSpecReference', missing: { file: lowerCase, foundAs: pet }, referencedBy: api },
        source
      );

      expect(printed()).to.equal(
        "'spec/api.yaml' refers to 'spec/schemas/pet.json', but the file is spelt 'spec/schemas/Pet.json' on disk."
      );
    });

    const PART_NAMED =
      "A '$ref' names a part of the file it is in as '#/components/schemas/Pet', and a part of another as " +
      "'./pets.yaml#/Pet'.";

    it('names the file a $ref the build cannot resolve is in, and how to name a part of a file', () => {
      reportSourceProblem({ kind: 'unresolvableSpecReference', reference: { file: api, ref: '#pet' } }, source);

      expect(printed()).to.equal(
        `'spec/api.yaml' has the '$ref' '#pet', which the portal cannot resolve.\n${PART_NAMED}`
      );
    });

    it('says a $ref is empty rather than quoting it', () => {
      reportSourceProblem({ kind: 'unresolvableSpecReference', reference: { file: pet, ref: '' } }, source);

      expect(printed()).to.equal(`'spec/schemas/Pet.json' has an empty '$ref'.\n${PART_NAMED}`);
    });
  });

  describe("a page at an address kept for the portal's own pages", () => {
    const content = source.join('content');

    it('names the page, where it would be served, and what the address is kept for', () => {
      reportContent({
        kind: 'reservedAddresses',
        pages: [
          {
            file: new FilePath(content.join('(intro)'), new FileName('sdks.md')),
            address: '/sdks',
            keptFor: { address: '/sdks', description: SDK_SECTION.description }
          }
        ]
      });

      const [heading, ...rest] = printed().split('\n');

      expect(heading).to.match(/^A page in .+ would be served where the portal puts pages of its own:$/);
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
            keptFor: { address: '/sdks', description: SDK_SECTION.description }
          },
          {
            file: new FilePath(content, new FileName('context-plugin.mdx')),
            address: '/context-plugin',
            keptFor: { address: '/context-plugin', description: PLUGIN_SECTION.description }
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

    it("says a page at /oauth/callback is kept for the API playground's OAuth authorization", () => {
      reportContent({
        kind: 'reservedAddresses',
        pages: [
          {
            file: new FilePath(content.join('oauth'), new FileName('callback.md')),
            address: '/oauth/callback',
            keptFor: OAUTH_CALLBACK
          }
        ]
      });

      expect(printed()).to.contain(
        "  • 'content/oauth/callback.md', at '/oauth/callback', which is kept for the API playground's OAuth authorization"
      );
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
          { key: '/guides', files: [page(content, 'guides.md'), page(content.join('guides'), 'index.md')] },
          { key: '/', files: [page(content, 'index.md'), page(content.join('(start)'), 'index.md')] }
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
        addresses: [{ key: '/faq', files: [page(content, 'faq.md'), page(content, 'faq.mdx')] }]
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
        "'content/nav.json' for the Home tab; the SDKs and Context Plugin sections keep their names."
    ]);
  });
});

describe('reportNoTabsListed', () => {
  const source = new DirectoryPath('project').join('src');
  const rootNavigation = new FilePath(source.join('content'), new FileName('nav.json'));
  let lines: string[];

  beforeEach(() => {
    lines = [];
    sinon.stub(log, 'warn').callsFake((text?: string | string[]) => {
      lines.push(stripVTControlCharacters(String(text)));
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('says nothing when the root file lists its tabs, empty or not', () => {
    reportNoTabsListed(undefined, source);

    expect(lines).to.deep.equal([]);
  });

  // The line offered names what nothing places, so following it collides with nothing in `pages`.
  it('names the file and the nodes nothing places, with both ways to say so on purpose', () => {
    reportNoTabsListed(
      {
        file: rootNavigation,
        unplaced: [
          { kind: 'generated', section: SDK_SECTION },
          { kind: 'generated', section: PLUGIN_SECTION },
          { kind: 'apiReference' }
        ]
      },
      source
    );

    expect(lines).to.deep.equal([
      "'content/nav.json' has no 'tabs', so nothing is a tab: the header shows no tab bar, and SDKs, Context " +
        "Plugin and the API reference are folders in Home's sidebar. Add " +
        '\'"tabs": ["apimatic:sdks","apimatic:plugin","apimatic:api"]\' to show them as tabs, or \'"tabs": []\' ' +
        'to keep this sidebar.'
    ]);
  });

  it('says there is no root file when there is none, and names only the nodes there are', () => {
    reportNoTabsListed(
      { file: undefined, unplaced: [{ kind: 'generated', section: SDK_SECTION }, { kind: 'apiReference' }] },
      source
    );

    expect(lines).to.deep.equal([
      "There is no 'content/nav.json', so nothing is a tab: the header shows no tab bar, and SDKs and the API " +
        'reference are folders in Home\'s sidebar. Add the file with \'"tabs": ["apimatic:sdks","apimatic:api"]\' ' +
        'to show them as tabs, or \'"tabs": []\' to keep this sidebar.'
    ]);
  });
});

describe('reportUnseenHomeTitle', () => {
  const source = new DirectoryPath('project').join('src');
  let lines: string[];

  beforeEach(() => {
    lines = [];
    sinon.stub(log, 'warn').callsFake((text?: string | string[]) => {
      lines.push(stripVTControlCharacters(String(text)));
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('says nothing when the title has a tab bar to show in', () => {
    reportUnseenHomeTitle(undefined, source);

    expect(lines).to.deep.equal([]);
  });

  it('says the title shows nowhere while Home is the only tab', () => {
    reportUnseenHomeTitle(new FilePath(source.join('content'), new FileName('nav.json')), source);

    expect(lines).to.deep.equal([
      "'content/nav.json' names the Home tab with 'title', but Home is the only tab and one tab draws no tab bar, " +
        "so the name shows nowhere. Name a tab in 'tabs', or remove the setting."
    ]);
  });
});

describe('reportUnmergedSpecs', () => {
  const source = new DirectoryPath('project').join('src');
  const spec = source.join('spec');
  let lines: string[];

  beforeEach(() => {
    lines = [];
    sinon.stub(log, 'warn').callsFake((text?: string | string[]) => {
      lines.push(stripVTControlCharacters(String(text)));
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('says nothing when the specs are merged, or there is one', () => {
    reportUnmergedSpecs([], source);

    expect(lines).to.deep.equal([]);
  });

  it('names the specs, says the SDKs cover one of them, and how to cover them all', () => {
    reportUnmergedSpecs(
      [new FilePath(spec, new FileName('orders.json')), new FilePath(spec, new FileName('items.json'))],
      source
    );

    expect(lines).to.deep.equal([
      "'spec/orders.json' and 'spec/items.json' are separate API definitions, and the SDKs are generated from one " +
        "of them only. To cover them all, give each its own folder and set 'MergeConfiguration.MergeApis' to " +
        "true in an 'APIMATIC-META.json' beside the folders."
    ]);
  });
});

describe('reportLeftOutSpecs', () => {
  const source = new DirectoryPath('project').join('src');
  const spec = source.join('spec');
  let lines: string[];

  beforeEach(() => {
    lines = [];
    sinon.stub(log, 'warn').callsFake((text?: string | string[]) => {
      lines.push(stripVTControlCharacters(String(text)));
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('says nothing when no API definition sits beside the merged folders', () => {
    reportLeftOutSpecs([], source);

    expect(lines).to.deep.equal([]);
  });

  it('names the one left out, and how to include it', () => {
    reportLeftOutSpecs([new FilePath(spec, new FileName('orders.json'))], source);

    expect(lines).to.deep.equal([
      "'spec/orders.json' is left out of the portal and the SDKs, as 'APIMATIC-META.json' merges only the folders " +
        'beside it. To include it, move it into a folder of its own, adding the folder to ' +
        "'MergeOrderOfDirectories' when the file lists folders."
    ]);
  });

  it('names several as a sentence would', () => {
    reportLeftOutSpecs(
      [new FilePath(spec, new FileName('orders.json')), new FilePath(spec, new FileName('items.json'))],
      source
    );

    expect(lines).to.deep.equal([
      "'spec/orders.json' and 'spec/items.json' are left out of the portal and the SDKs, as 'APIMATIC-META.json' " +
        'merges only the folders beside it. To include them, move each into a folder of its own, adding the ' +
        "folders to 'MergeOrderOfDirectories' when the file lists folders."
    ]);
  });
});

describe('reportTaggedPages', () => {
  const source = new DirectoryPath('project').join('src');
  const index = new FilePath(source.join('content'), new FileName('index.md'));
  const intro = new FilePath(source.join('content', 'guides'), new FileName('intro.md'));
  let lines: string[];

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

  it('says nothing when no .md page has a tag', () => {
    reportTaggedPages([], source);

    expect(lines).to.deep.equal([]);
  });

  it('names each tag of a page with its line, and how to keep them', () => {
    reportTaggedPages(
      [
        {
          page: index,
          tags: [
            { name: 'br', line: 5 },
            { name: 'details', line: 9 }
          ]
        }
      ],
      source
    );

    expect(lines.join('\n').split('\n')).to.deep.equal([
      `A '.md' page in '${source.toString()}' has HTML or components, which the portal leaves out:`,
      "  • 'content/index.md', line 5: '<br>'",
      "  • 'content/index.md', line 9: '<details>'",
      "Rename the page to '.mdx' to keep them, and close empty tags such as '<br />'."
    ]);
  });

  it('names the first three tags of a page, and counts the rest', () => {
    const tags = [5, 9, 12, 14, 20].map((line) => ({ name: 'br', line }));

    reportTaggedPages([{ page: index, tags }], source);

    expect(lines[1].split('\n')).to.deep.equal([
      "  • 'content/index.md', line 5: '<br>'",
      "  • 'content/index.md', line 9: '<br>'",
      "  • 'content/index.md', line 12: '<br>'",
      '    and 2 more on this page'
    ]);
  });

  it('speaks of each page when there are several', () => {
    reportTaggedPages(
      [
        { page: index, tags: [{ name: 'br', line: 5 }] },
        { page: intro, tags: [{ name: 'Cards', line: 3 }] }
      ],
      source
    );

    expect(lines[0]).to.equal(
      `Some '.md' pages in '${source.toString()}' have HTML or components, which the portal leaves out:`
    );
    expect(lines[1]).to.contain("'content/guides/intro.md', line 3: '<Cards>'");
    expect(lines[2]).to.match(/^Rename each page to '\.mdx'/);
  });
});

describe('reportSharedEndpoints', () => {
  const source = new DirectoryPath('project').join('src');
  const spec = source.join('spec');
  const files = ['alpha', 'beta'].map((folder) => new FilePath(spec.join(folder), new FileName('openapi.json')));
  let lines: string[];

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

  it('says nothing when no two specs declare the same operation', () => {
    reportSharedEndpoints([], source);

    expect(lines).to.deep.equal([]);
  });

  it('names each operation and the specs declaring it, and why it shows no SDK sample', () => {
    reportSharedEndpoints(
      [
        { key: new Endpoint('get', '/status'), files },
        { key: new Endpoint('post', '/status'), files }
      ],
      source
    );

    expect(lines.join('\n').split('\n')).to.deep.equal([
      'More than one API definition declares these operations, so the portal shows no SDK sample on them:',
      "  • 'GET /status': 'spec/alpha/openapi.json' and 'spec/beta/openapi.json'",
      "  • 'POST /status': 'spec/alpha/openapi.json' and 'spec/beta/openapi.json'"
    ]);
  });

  it('speaks of one operation when there is one', () => {
    reportSharedEndpoints([{ key: new Endpoint('get', '/status'), files }], source);

    expect(lines[0]).to.contain('declares this operation,');
    expect(lines[0]).to.contain('no SDK sample on it:');
  });
});
