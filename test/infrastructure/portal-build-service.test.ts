import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { PortalBuildService } from '../../src/infrastructure/portal-build-service';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';

// `build` runs `process.execPath <viteBinary> build` in the project, so a plain script standing in
// for Vite exercises how a failure is reported without a build.
describe('PortalBuildService', () => {
  let root: string;
  let project: DirectoryPath;

  const failingWith = (output: string, contentSource: DirectoryPath | null) => {
    fs.writeFileSync(path.join(root, 'fake-vite.js'), `console.error(${JSON.stringify(output)}); process.exit(1);`);
    return {
      projectDirectory: project,
      viteBinary: new FilePath(new DirectoryPath(root), new FileName('fake-vite.js')),
      contentSource
    };
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-build-'));
    project = new DirectoryPath(root).join('build');
    fs.mkdirSync(project.toString(), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // The build reads the project's copy of the pages, which is gone once the command ends.
  it("names the source's own page where a failed build names its copy, in either spelling", async () => {
    const copy = project.join('content').toString();
    const source = new DirectoryPath(root).join('src', 'content');
    const failure = failingWith(
      `error during build:\n${copy.split(path.sep).join('/')}/index.mdx 5:40: Could not parse expression\nat ${copy}${
        path.sep
      }guide.md`,
      source
    );

    const log = (await new PortalBuildService().build(failure))._unsafeUnwrapErr().log;

    expect(log).to.contain(`${source.toString().split(path.sep).join('/')}/index.mdx 5:40`);
    expect(log).to.contain(`${source.toString()}${path.sep}guide.md`);
    expect(log).to.not.contain(copy);
  });

  it('leaves the log as it was for a source without pages', async () => {
    const failure = failingWith('error during build:\nsomething else', null);

    const log = (await new PortalBuildService().build(failure))._unsafeUnwrapErr().log;

    expect(log).to.contain('something else');
  });
});
