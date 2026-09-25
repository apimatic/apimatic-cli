import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { ContentNotices, noticesSince } from '../../../src/types/portal/content-notices';
import { PLUGIN_SECTION, SDK_SECTION } from '../../../src/types/portal/generated-pages';
import { PortalTab, SharedTabName } from '../../../src/types/portal/portal-tabs';

describe('noticesSince', () => {
  const content = new DirectoryPath('src', 'content');
  const page = (name: string) => new FilePath(content.join('api').join('api'), new FileName(name));
  const folder = (name: string) => content.join(name);

  const NONE: ContentNotices = { hiddenPages: [], ignoredNavigationFiles: [], folderTabs: [], sharedTabNames: [] };
  const notices = (overrides: Partial<ContentNotices>): ContentNotices => ({ ...NONE, ...overrides });

  const home: PortalTab = { owner: { kind: 'home' }, name: 'Guides', namedBy: null };
  const guides: PortalTab = {
    owner: { kind: 'folder', directory: folder('guides') },
    name: 'Guides',
    namedBy: new FilePath(folder('guides'), new FileName('nav.json'))
  };
  const shared = (name: string, tabs: PortalTab[]): SharedTabName => ({ name, tabs });

  it('gives every notice the first time', () => {
    const current = notices({ hiddenPages: [page('notes.md')], folderTabs: [folder('guides')] });

    expect(noticesSince(current, NONE)).to.deep.equal(current);
  });

  it('gives nothing that was given before, whichever file now names a tab', () => {
    const current = notices({
      hiddenPages: [page('notes.md')],
      ignoredNavigationFiles: [new FilePath(content, new FileName('Nav.json'))],
      folderTabs: [folder('guides')],
      sharedTabNames: [shared('Guides', [home, guides])]
    });
    const again = notices({
      hiddenPages: [page('notes.md')],
      ignoredNavigationFiles: [new FilePath(content, new FileName('Nav.json'))],
      folderTabs: [folder('guides')],
      sharedTabNames: [shared('Guides', [{ ...guides, namedBy: null }, home])]
    });

    expect(noticesSince(again, current)).to.deep.equal(NONE);
  });

  // The whole list, so the notice still says all that is true of the content.
  it('gives a kind of notice in full when it holds something new, and leaves the others out', () => {
    const before = notices({ hiddenPages: [page('notes.md')], folderTabs: [folder('guides')] });
    const after = notices({ hiddenPages: [page('notes.md'), page('faq.md')], folderTabs: [folder('guides')] });

    expect(noticesSince(after, before)).to.deep.equal(notices({ hiddenPages: [page('notes.md'), page('faq.md')] }));
  });

  it('gives nothing for a notice that went away, or for the same folders in another order', () => {
    const before = notices({ hiddenPages: [page('notes.md')], folderTabs: [folder('guides'), folder('concepts')] });
    const after = notices({ folderTabs: [folder('concepts'), folder('guides')] });

    expect(noticesSince(after, before)).to.deep.equal(NONE);
  });

  it('gives a name shared by another tab than before', () => {
    const sdks: PortalTab = { owner: { kind: 'generated', section: SDK_SECTION }, name: 'Guides', namedBy: null };
    const plugin: PortalTab = { owner: { kind: 'generated', section: PLUGIN_SECTION }, name: 'Guides', namedBy: null };
    const before = notices({ sharedTabNames: [shared('Guides', [home, sdks])] });
    const after = notices({ sharedTabNames: [shared('Guides', [home, plugin])] });

    expect(noticesSince(after, before).sharedTabNames).to.deep.equal(after.sharedTabNames);
  });
});
