import fs from 'fs';
import path from 'path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { expect } from 'chai';
import { sampleFiles } from '../../../helpers/mock-sample.js';

const repositoryRoot = process.cwd();
const schemaFile = 'mock-stubs.schema.json';

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));

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

  it('accepts every stub file of the sample set', () => {
    const refused = Object.entries(sampleFiles)
      .filter(([, content]) => validate(JSON.parse(content)) !== true)
      .map(([name]) => name);

    expect(refused).to.deep.equal([]);
  });
});
