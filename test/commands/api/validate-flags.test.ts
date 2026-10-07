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

  it('refuses a flag given empty, as an unset shell variable gives it, rather than reading it as left out', async () => {
    for (const flag of ['--file', '--url', '--input', '-i']) {
      expect((await rejects([flag, ''])).message).to.contain('The value is empty');
    }
    expect((await rejects(['--file', ' '])).message).to.contain('The value is empty');
    expect((await rejects(['--file', '', '--input', './project'])).message).to.contain('Parsing --file');
  });
});
