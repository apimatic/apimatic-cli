import { expect } from 'chai';
import ApiValidate from '../../../src/commands/api/validate.js';
import { flagParser } from '../flag-parser.js';

const { rejects } = flagParser(ApiValidate);

describe('api validate flags', () => {
  it('takes the specification from one place only: a file, a URL, or a project directory', async () => {
    expect((await rejects(['--file', 'openapi.json', '--input', './'])).message).to.contain('--input');
    expect((await rejects(['--url', 'https://example.org/openapi.json', '--input', './'])).message).to.contain(
      '--input'
    );
    expect((await rejects(['--file', 'openapi.json', '--url', 'https://example.org/openapi.json'])).message).to.contain(
      '--url'
    );
  });
});
