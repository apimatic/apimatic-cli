import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { PLUGIN_SECTION, SDK_SECTION } from '../../../src/types/portal/generated-pages';
import {
  directoryTabName,
  frontMatterTitle,
  PortalTab,
  sharedTabNames,
  TabOwner,
  untitledTabName
} from '../../../src/types/portal/portal-tabs';

describe('portal tabs', () => {
  const navigationOf = (directory: string) =>
    new FilePath(new DirectoryPath('content', directory), new FileName('nav.json'));

  describe('sharedTabNames', () => {
    const home: PortalTab = { owner: { kind: 'home' }, name: 'Home', namedBy: null };
    const api: PortalTab = { owner: { kind: 'apiReference' }, name: 'API Reference', namedBy: null };
    const sdks: PortalTab = { owner: { kind: 'generated', section: SDK_SECTION }, name: 'SDKs', namedBy: null };
    const folder = (name: string): PortalTab => {
      const navigation = navigationOf(name.toLowerCase());
      return { owner: { kind: 'folder', navigation }, name, namedBy: navigation };
    };

    it('finds nothing when every tab has a name of its own', () => {
      expect(sharedTabNames([home, folder('Tutorials'), api, sdks])).to.deep.equal([]);
    });

    it('groups the tabs of each name that more than one tab has', () => {
      const homeFolder = folder('Home');
      const sdksFolder = folder('SDKs');

      expect(sharedTabNames([home, homeFolder, folder('Tutorials'), sdksFolder, api, sdks])).to.deep.equal([
        { name: 'Home', tabs: [home, homeFolder] },
        { name: 'SDKs', tabs: [sdksFolder, sdks] }
      ]);
    });

    // The tab bar shows each name as written, so these two can be told apart.
    it('tells names apart by case', () => {
      expect(sharedTabNames([home, folder('home')])).to.deep.equal([]);
    });
  });

  describe('untitledTabName', () => {
    for (const [owner, name] of [
      [{ kind: 'home' }, 'Home'],
      [{ kind: 'apiReference' }, 'API Reference'],
      [{ kind: 'generated', section: PLUGIN_SECTION }, 'Context Plugin'],
      [{ kind: 'folder', navigation: navigationOf('getting-started') }, 'Getting started']
    ] as [TabOwner, string][]) {
      it(`names the ${owner.kind} tab '${name}'`, () => {
        expect(untitledTabName(owner)).to.equal(name);
      });
    }
  });

  describe('directoryTabName', () => {
    for (const [directory, name] of [
      ['tutorials', 'Tutorials'],
      ['getting-started', 'Getting started'],
      ['(learn)', 'Learn'],
      ['API', 'API']
    ]) {
      it(`names '${directory}' '${name}', as Fumadocs does`, () => {
        expect(directoryTabName(directory)).to.equal(name);
      });
    }
  });

  describe('frontMatterTitle', () => {
    it('reads the title from the front matter', () => {
      expect(frontMatterTitle('---\ntitle: Learn the API\ndescription: More\n---\n\n# Body')).to.equal('Learn the API');
    });

    it('reads front matter written with Windows line endings', () => {
      expect(frontMatterTitle('---\r\ntitle: Learn\r\n---\r\nBody')).to.equal('Learn');
    });

    // The build's own parser, which does not need a line break after the closing marker.
    it('reads front matter whose closing marker the body follows on the same line', () => {
      expect(frontMatterTitle('---\ntitle: Learn\n--- \nBody')).to.equal('Learn');
    });

    for (const [description, markdown] of [
      ['no front matter', '# Learn the API'],
      ['front matter that is not at the top', '\n---\ntitle: Learn\n---\n'],
      ['front matter with no title', '---\ndescription: More\n---\n'],
      ['a title that is not a string', '---\ntitle: [1, 2]\n---\n'],
      ['front matter that is not YAML', '---\ntitle: "unclosed\n---\n']
    ]) {
      it(`gives nothing for ${description}`, () => {
        expect(frontMatterTitle(markdown)).to.be.undefined;
      });
    }
  });
});
