import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nock from 'nock';
import { expect } from 'chai';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';
import { ResourceInput } from '../../src/types/file/resource-input';
import { UrlPath } from '../../src/types/file/urlPath';
import { ProjectContext } from '../../src/types/project-context';
import { ResourceContext } from '../../src/types/resource-context';

const HOST = 'http://specs.test';

describe('ResourceContext', () => {
  let root: string;
  let tempDirectory: DirectoryPath;

  const contentsOf = (file: FilePath) => fs.readFileSync(file.toString(), 'utf8');
  const resolve = (input: ResourceInput) => ResourceContext.resolveTo(input, tempDirectory);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-context-'));
    tempDirectory = new DirectoryPath(root).join('temp');
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('tells a file, a URL and a project apart', async () => {
    fs.writeFileSync(path.join(root, 'openapi.json'), '{}');
    fs.mkdirSync(path.join(root, 'src', 'spec'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'spec', 'openapi.json'), '{}');
    nock(HOST).get('/openapi.json').reply(200, '{}');
    const kindOf = async (input: ResourceInput) => (await resolve(input))._unsafeUnwrap().kind();

    expect(await kindOf(new FilePath(new DirectoryPath(root), new FileName('openapi.json')))).to.equal('file');
    expect(await kindOf(new UrlPath(`${HOST}/openapi.json`))).to.equal('url');
    expect(await kindOf(ProjectContext.in(new DirectoryPath(root)))).to.equal('project');
  });

  it('copies a local file under its own name', async () => {
    fs.writeFileSync(path.join(root, 'openapi.yaml'), 'openapi: 3.0.3');
    const file = new FilePath(new DirectoryPath(root), new FileName('openapi.yaml'));

    const copy = (await resolve(file))._unsafeUnwrap().file();

    expect(copy.isEqual(file)).to.be.false;
    expect(copy.name().toString()).to.equal('openapi.yaml');
    expect(contentsOf(copy)).to.equal('openapi: 3.0.3');
  });

  it('reports a local file it cannot read as the file the user gave', async () => {
    const missing = new FilePath(new DirectoryPath(root), new FileName('missing.json'));

    const resolved = await resolve(missing);

    expect(resolved._unsafeUnwrapErr()).to.deep.equal({ kind: 'fileUnreadable', file: missing });
  });

  it('names a download by the file the server sends', async () => {
    nock(HOST)
      .get('/download')
      .query({ id: '1' })
      .reply(200, 'openapi: 3.0.3', { 'Content-Disposition': 'attachment; filename="petstore.yaml"' });

    const file = (await resolve(new UrlPath(`${HOST}/download?id=1`)))._unsafeUnwrap().file();

    expect(file.name().toString()).to.equal('petstore.yaml');
    expect(contentsOf(file)).to.equal('openapi: 3.0.3');
  });

  it('names a download the server does not name by its address, without the query', async () => {
    nock(HOST).get('/v1/openapi.json').query({ token: 'abc' }).reply(200, '{}');

    const url = new UrlPath(`${HOST}/v1/openapi.json?token=abc`);
    const file = (await resolve(url))._unsafeUnwrap().file();

    expect(file.name().toString()).to.equal('openapi.json');
  });

  it('reports a download that failed with the address it was fetched from', async () => {
    nock(HOST).get('/openapi.json').reply(404);
    const url = new UrlPath(`${HOST}/openapi.json`);

    const problem = (await resolve(url))._unsafeUnwrapErr();

    expect(problem.kind).to.equal('downloadFailed');
    expect(problem.kind === 'downloadFailed' && problem.url).to.equal(url);
  });
});
