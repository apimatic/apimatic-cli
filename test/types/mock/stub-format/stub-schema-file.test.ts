import fs from 'fs';
import path from 'path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { expect } from 'chai';

const repositoryRoot = process.cwd();
const schemaFile = 'mock-stubs.schema.json';
const fixtures = path.join(repositoryRoot, 'test', 'resources', 'mock');
const stubSets = [
  { name: 'sample', stubs: 20 },
  { name: 'spec-s', stubs: 84 },
  { name: 'tester-poc', stubs: 113 }
];

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));
const stubFilesOf = (set: string): string[] =>
  fs
    .readdirSync(path.join(fixtures, set))
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(fixtures, set, file));

describe('mock-stubs.schema.json', () => {
  const schema = readJson(path.join(repositoryRoot, schemaFile)) as { $schema: string };
  // Strict mode refuses unknown keywords, so a keyword ajv does not implement fails here rather than
  // passing every stub file unchecked. strictRequired alone is off: the kind rule names 'request' and
  // 'oauth2' under a 'not', where no 'properties' describes them.
  const validate = new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(schema);

  it('is published with the package', () => {
    const manifest = readJson(path.join(repositoryRoot, 'package.json')) as { files: string[] };

    const published = manifest.files;

    expect(published).to.include(`/${schemaFile}`);
  });

  it('is written in the JSON Schema draft the loader validates with', () => {
    const draft = schema.$schema;

    expect(draft).to.equal('https://json-schema.org/draft/2020-12/schema');
  });

  for (const set of stubSets) {
    it(`accepts every stub file of the ${set.name} set`, () => {
      const files = stubFilesOf(set.name);

      const refused = files.filter((file) => validate(readJson(file)) !== true).map((file) => path.basename(file));

      expect(refused).to.deep.equal([]);
    });

    it(`finds the ${set.stubs} stubs of the ${set.name} set`, () => {
      const files = stubFilesOf(set.name);

      const stubs = files.flatMap((file) => readJson(file) as unknown[]);

      expect(stubs).to.have.lengthOf(set.stubs);
    });
  }
});
