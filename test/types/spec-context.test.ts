import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import AdmZip from 'adm-zip';
import { expect } from 'chai';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { SpecContext } from '../../src/types/spec-context';

const OPENAPI = '{"openapi":"3.0.3"}';
const USER_META = '{"ImportSettings":{}}';
const DEFAULT_META = '{"ValidationConfiguration":{}}';

describe('SpecContext', () => {
  let root: string;
  let specDirectory: DirectoryPath;
  let tempDirectory: DirectoryPath;

  const writeSpec = (relative: string, contents: string) => {
    const file = path.join(specDirectory.toString(), relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };

  const entriesOf = (zip: string): Record<string, string> =>
    Object.fromEntries(
      new AdmZip(zip)
        .getEntries()
        .filter((entry) => !entry.isDirectory)
        .map((entry) => [entry.entryName, entry.getData().toString('utf8')])
    );

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-context-'));
    specDirectory = new DirectoryPath(root).join('src', 'spec');
    tempDirectory = new DirectoryPath(root).join('temp');
    fs.mkdirSync(tempDirectory.toString(), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('hasMeta', () => {
    it('is true when the directory holds an APIMATIC-META.json', async () => {
      writeSpec('openapi.json', OPENAPI);
      writeSpec('APIMATIC-META.json', USER_META);

      expect(await new SpecContext(specDirectory).hasMeta()).to.be.true;
    });

    it('is false when it does not', async () => {
      writeSpec('openapi.json', OPENAPI);

      expect(await new SpecContext(specDirectory).hasMeta()).to.be.false;
    });
  });

  describe('archive', () => {
    it('zips every file of the directory, nested ones included, at the root of a .zip', async () => {
      writeSpec('openapi.json', OPENAPI);
      writeSpec('APIMATIC-META.json', USER_META);
      writeSpec('schemas/pet.json', '{}');

      const zip = (await new SpecContext(specDirectory).archive(tempDirectory, null))._unsafeUnwrap();

      expect(zip.toString().endsWith('.zip')).to.be.true;
      expect(entriesOf(zip.toString())).to.deep.equal({
        'openapi.json': OPENAPI,
        'APIMATIC-META.json': USER_META,
        'schemas/pet.json': '{}'
      });
    });

    it('adds the given metadata to the archive without writing it into the directory', async () => {
      writeSpec('openapi.json', OPENAPI);

      const zip = (
        await new SpecContext(specDirectory).archive(tempDirectory, Readable.from([DEFAULT_META]))
      )._unsafeUnwrap();

      expect(entriesOf(zip.toString())).to.deep.equal({
        'openapi.json': OPENAPI,
        'APIMATIC-META.json': DEFAULT_META
      });
      expect(fs.readdirSync(specDirectory.toString())).to.deep.equal(['openapi.json']);
    });
  });
});
