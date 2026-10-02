import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nock from 'nock';
import { expect } from 'chai';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';
import { UrlPath } from '../../src/types/file/urlPath';
import { ProjectContext } from '../../src/types/project-context';
import { ResourceContext } from '../../src/types/resource-context';

const HOST = 'http://specs.test';

describe('ResourceContext', () => {
  let root: string;
  let tempDirectory: DirectoryPath;

  const contentsOf = (file: FilePath) => fs.readFileSync(file.toString(), 'utf8');

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

  it('tells a file, a URL and a project apart', () => {
    const file = new FilePath(new DirectoryPath(root), new FileName('openapi.json'));

    expect(new ResourceContext(file, tempDirectory).kind()).to.equal('file');
    expect(new ResourceContext(new UrlPath(`${HOST}/openapi.json`), tempDirectory).kind()).to.equal('url');
    expect(new ResourceContext(ProjectContext.in(new DirectoryPath(root)), tempDirectory).kind()).to.equal('project');
  });

  it('copies a local file under its own name', async () => {
    fs.writeFileSync(path.join(root, 'openapi.yaml'), 'openapi: 3.0.3');
    const file = new FilePath(new DirectoryPath(root), new FileName('openapi.yaml'));

    const copy = (await new ResourceContext(file, tempDirectory).resolveTo())._unsafeUnwrap();

    expect(copy.isEqual(file)).to.be.false;
    expect(copy.name().toString()).to.equal('openapi.yaml');
    expect(contentsOf(copy)).to.equal('openapi: 3.0.3');
  });

  it('reports a local file it cannot read as the file the user gave', async () => {
    const missing = new FilePath(new DirectoryPath(root), new FileName('missing.json'));

    const resolved = await new ResourceContext(missing, tempDirectory).resolveTo();

    expect(resolved._unsafeUnwrapErr()).to.deep.equal({ kind: 'fileUnreadable', file: missing });
  });

  it('downloads a URL once, however often it is resolved', async () => {
    const scope = nock(HOST).get('/openapi.json').once().reply(200, 'openapi: 3.0.3');
    const spec = new ResourceContext(new UrlPath(`${HOST}/openapi.json`), tempDirectory);

    const first = (await spec.resolveTo())._unsafeUnwrap();
    const second = (await spec.resolveTo())._unsafeUnwrap();

    expect(scope.isDone()).to.be.true;
    expect(second.isEqual(first)).to.be.true;
    expect(contentsOf(second)).to.equal('openapi: 3.0.3');
  });

  it('names a download by the file the server sends', async () => {
    nock(HOST)
      .get('/download')
      .query({ id: '1' })
      .reply(200, 'openapi: 3.0.3', { 'Content-Disposition': 'attachment; filename="petstore.yaml"' });

    const file = (
      await new ResourceContext(new UrlPath(`${HOST}/download?id=1`), tempDirectory).resolveTo()
    )._unsafeUnwrap();

    expect(file.name().toString()).to.equal('petstore.yaml');
  });

  it('names a download the server does not name by its address, without the query', async () => {
    nock(HOST).get('/v1/openapi.json').query({ token: 'abc' }).reply(200, '{}');

    const url = new UrlPath(`${HOST}/v1/openapi.json?token=abc`);
    const file = (await new ResourceContext(url, tempDirectory).resolveTo())._unsafeUnwrap();

    expect(file.name().toString()).to.equal('openapi.json');
  });

  it('reports a download that failed with the address it was fetched from', async () => {
    nock(HOST).get('/openapi.json').reply(404);
    const url = new UrlPath(`${HOST}/openapi.json`);

    const problem = (await new ResourceContext(url, tempDirectory).resolveTo())._unsafeUnwrapErr();

    expect(problem.kind).to.equal('downloadFailed');
    expect(problem.kind === 'downloadFailed' && problem.url).to.equal(url);
  });
});
