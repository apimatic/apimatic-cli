import { expect } from 'chai';
import { Directory, DirectoryItem } from '../../../src/types/file/directory';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { ContentFile, ContentTree, ReadPage } from '../../../src/types/portal/content-tree';
import { GeneratedPages } from '../../../src/types/portal/generated-pages';
import { parsePage } from '../../../src/types/portal/page';
import { PortalLanguages } from '../../../src/types/portal/portal-languages';

// The tree is built in memory and every file handed over, so nothing here touches the disk.
describe('ContentTree', () => {
  const source = new DirectoryPath('project', 'src');
  const content = source.join('content');
  const GENERATED = GeneratedPages.of(PortalLanguages.fromBlock({ typescript: {} }, [])._unsafeUnwrap(), null);

  const file = (name: string): DirectoryItem => ({ fileName: new FileName(name) });
  const folder = (path: DirectoryPath, items: DirectoryItem[]) => new Directory(path, items);
  const relative = (files: FilePath[]) => files.map((each) => each.relativeTo(source));

  const TREE = folder(content, [
    file('index.md'),
    file('nav.json'),
    file('Nav.json'),
    file('._index.md'),
    folder(content.join('guides'), [file('intro.mdx'), file('nav.json')]),
    folder(content.join('.drafts'), [file('notes.md'), file('nav.json')]),
    folder(content.join('node_modules'), [file('README.md')])
  ]);

  const tree = new ContentTree(TREE, source);

  /** A file below `content/`, by its folders and then its name. */
  const inContent = (...path: string[]) =>
    new FilePath(content.join(...path.slice(0, -1)), new FileName(path[path.length - 1]));
  const handed = (...files: [FilePath, string][]): ContentFile[] =>
    files.map(([file, contents]) => ({ file, contents }));
  /** Pages as the source context hands them: read, and parsed as the build parses them. */
  const parsed = (...files: [FilePath, string][]): Promise<ReadPage[]> =>
    Promise.all(
      files.map(async ([file, contents]) => ({
        file,
        contents,
        parsed: await parsePage(contents, file.name(), file.relativeTo(source))
      }))
    );
  let pages: ReadPage[];

  before(async () => {
    pages = await parsed(
      [inContent('index.md'), '---\ntitle: Home\n---\n'],
      [inContent('guides', 'intro.mdx'), '---\ntitle: Intro\n---\n']
    );
  });

  it('names the pages and nav.json files the build reads, and none it passes over', () => {
    expect(relative(tree.pages())).to.deep.equal(['content/index.md', 'content/guides/intro.mdx']);
    expect(relative(tree.navigationFiles())).to.deep.equal(['content/nav.json', 'content/guides/nav.json']);
  });

  it('says which files the build reads from it, and which it passes over', () => {
    expect(tree.holds(inContent('guides', 'diagram.png'))).to.equal(true);
    expect(tree.holds(inContent('.drafts', 'sketch.png'))).to.equal(false);
    expect(tree.holds(new FilePath(source.join('static'), new FileName('logo.png')))).to.equal(false);
  });

  it('judges the files it is handed', () => {
    const navigationFiles = handed(
      [inContent('nav.json'), JSON.stringify({ pages: ['index', 'guides', 'missing'] })],
      [inContent('guides', 'nav.json'), JSON.stringify({ title: 'Guides' })]
    );

    const checked = tree.check({ pages, navigationFiles, missingImages: [] }, [], GENERATED);

    expect(checked._unsafeUnwrapErr()).to.deep.equal([
      {
        kind: 'invalidNavigation',
        errors: ["content/nav.json: 'missing' is not a page or folder in this directory."]
      }
    ]);
  });

  // Looked up by the caller, which has the disk; refused here, with the page problems ahead of the navigation's.
  it('refuses the images it is told the build would not find', () => {
    const navigationFiles = handed([inContent('nav.json'), JSON.stringify({ pages: ['index', 'guides', 'missing'] })]);
    const image = {
      page: inContent('index.md'),
      line: 3,
      url: '/images/logo.png',
      missing: { file: new FilePath(source.join('static', 'images'), new FileName('logo.png')), foundAs: null }
    };

    const problems = tree.check({ pages, navigationFiles, missingImages: [image] }, [], GENERATED)._unsafeUnwrapErr();

    expect(problems.map(({ kind }) => kind)).to.deep.equal(['missingImages', 'invalidNavigation']);
    expect(problems[0]).to.deep.equal({ kind: 'missingImages', images: [image] });
  });

  it('names the tabs from what it is handed', () => {
    const navigationFiles = handed(
      [inContent('nav.json'), JSON.stringify({ title: 'Guides', pages: ['index', 'guides'] })],
      [inContent('guides', 'nav.json'), JSON.stringify({ title: 'Guides' })]
    );

    const notices = tree.check({ pages, navigationFiles, missingImages: [] }, [], GENERATED)._unsafeUnwrap();

    expect(notices.folderTabs.map((directory) => directory.leafName())).to.deep.equal(['guides']);
    expect(notices.sharedTabNames.map(({ name, tabs }) => [name, tabs.map(({ owner }) => owner.kind)])).to.deep.equal([
      ['Guides', ['home', 'folder']]
    ]);
    expect(relative(notices.ignoredNavigationFiles)).to.deep.equal(['content/Nav.json']);
  });
});
