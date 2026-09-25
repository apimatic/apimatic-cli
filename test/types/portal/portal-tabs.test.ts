import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { PLUGIN_SECTION, SDK_SECTION } from '../../../src/types/portal/generated-pages';
import {
  directoryTabName,
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
    const folder = (name: string): PortalTab => ({
      owner: { kind: 'folder', directory: new DirectoryPath('content', name.toLowerCase()) },
      name,
      namedBy: navigationOf(name.toLowerCase())
    });

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
    // Guides and guides read as one name in a tab bar.
    it('counts names that differ only in case as the same, under the first one’s spelling', () => {
      const lower = folder('home');

      expect(sharedTabNames([home, lower])).to.deep.equal([{ name: 'Home', tabs: [home, lower] }]);
    });
  });

  describe('untitledTabName', () => {
    for (const [owner, name] of [
      [{ kind: 'home' }, 'Home'],
      [{ kind: 'apiReference' }, 'API Reference'],
      [{ kind: 'generated', section: PLUGIN_SECTION }, 'Context Plugin'],
      [{ kind: 'folder', directory: new DirectoryPath('content', 'getting-started') }, 'Getting started']
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
});
