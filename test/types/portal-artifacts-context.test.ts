import fs from 'fs';
import os from 'os';
import path from 'path';
import { Buffer } from 'buffer';
import { Readable } from 'stream';
import { expect } from 'chai';
import { ZipService } from '../../src/infrastructure/zip-service';
import { PortalArtifactsContext } from '../../src/types/portal-artifacts-context';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { FilePath } from '../../src/types/file/filePath';
import { Endpoint } from '../../src/types/portal/endpoint';

const CATALOG = {
  paths: { '/payments': { get: { 'sample-a': 'client.payments.list()' } } }
};

describe('PortalArtifactsContext', () => {
  let root: string;
  let artifactsDirectory: string;

  /** Lays the zip out on disk exactly as `/portal-artifacts` does, then zips it. */
  const zipOf = async (entries: Record<string, string>): Promise<Buffer> => {
    const staging = fs.mkdtempSync(path.join(root, 'staging-'));
    for (const [entry, contents] of Object.entries(entries)) {
      const file = path.join(staging, entry);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    }

    const zipPath = new FilePath(new DirectoryPath(root), new FileName(`${path.basename(staging)}.zip`));
    await new ZipService().archive(new DirectoryPath(staging), zipPath);
    return fs.readFileSync(zipPath.toString());
  };

  const unpack = async (zip: Buffer) =>
    await new PortalArtifactsContext(new DirectoryPath(artifactsDirectory)).unpack(Readable.from(zip));

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-artifacts-context-'));
    artifactsDirectory = fs.mkdtempSync(path.join(root, 'artifacts-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('a zip that delivers everything', () => {
    let zip: Buffer;

    beforeEach(async () => {
      zip = await zipOf({
        'sdk/csharp.zip': 'PK csharp-sdk',
        'sdk/typescript.zip': 'PK typescript-sdk',
        'code-samples/csharp.json': JSON.stringify(CATALOG),
        'plugin.zip': 'PK plugin'
      });
    });

    it('reads a catalog per language into the samples the build merges', async () => {
      const artifacts = (await unpack(zip))._unsafeUnwrap();

      const samples = artifacts.codeSampleCatalogs.samplesFor(new Endpoint('GET', '/payments'));
      expect(samples.map((sample) => sample.lang)).to.deep.equal(['csharp']);
    });

    // Keyed by the delivered name rather than parsed, so placement is a copy under the same name.
    it('names each SDK by the file it arrived as', async () => {
      const artifacts = (await unpack(zip))._unsafeUnwrap();

      expect([...artifacts.sdks.keys()].sort()).to.deep.equal(['csharp', 'typescript']);
      expect(fs.readFileSync(artifacts.sdks.get('csharp')!.toString(), 'utf8')).to.equal('PK csharp-sdk');
    });

    it('hands back the plugin archive', async () => {
      const artifacts = (await unpack(zip))._unsafeUnwrap();

      expect(artifacts.plugin).to.not.be.undefined;
      expect(fs.readFileSync(artifacts.plugin!.toString(), 'utf8')).to.equal('PK plugin');
    });

    it('unpacks into the directory it was given, and nowhere else', async () => {
      const artifacts = (await unpack(zip))._unsafeUnwrap();

      expect(artifacts.plugin!.toString()).to.have.string(artifactsDirectory);
    });
  });

  // A portal that declares no languages and no plugin is a valid run. It must not look like a
  // failure, or a docs-only portal could never be built.
  it('reads a zip that delivers nothing as no samples, no SDKs and no plugin', async () => {
    const artifacts = (await unpack(await zipOf({})))._unsafeUnwrap();

    expect(artifacts.codeSampleCatalogs.samplesFor(new Endpoint('GET', '/payments'))).to.be.empty;
    expect(artifacts.sdks.size).to.equal(0);
    expect(artifacts.plugin).to.be.undefined;
  });

  it('refuses a catalog for a language it cannot read, rather than leaving it out', async () => {
    const zip = await zipOf({ 'code-samples/cobol.json': JSON.stringify(CATALOG) });

    expect((await unpack(zip))._unsafeUnwrapErr()).to.deep.equal({ kind: 'unreadableCatalog', language: 'cobol' });
  });

  it('refuses a catalog that is not a catalog', async () => {
    const zip = await zipOf({ 'code-samples/csharp.json': '{ not json' });

    expect((await unpack(zip))._unsafeUnwrapErr()).to.deep.equal({ kind: 'unreadableCatalog', language: 'csharp' });
  });

  it('refuses a download that is not a zip', async () => {
    expect((await unpack(Buffer.from('not a zip')))._unsafeUnwrapErr()).to.deep.equal({ kind: 'unreadableArchive' });
  });
});
