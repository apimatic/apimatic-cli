import { expect } from 'chai';
import { Parser } from '@oclif/core';
import ApiValidate from '../../../src/commands/api/validate.js';

const parse = (argv: string[]) => Parser.parse(argv, { flags: ApiValidate.flags as never, strict: true } as never);

const rejects = async (argv: string[]): Promise<Error> => {
  let thrown: unknown;
  try {
    await parse(argv);
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `expected ${argv.join(' ')} to be rejected`).to.be.an('error');
  return thrown as Error;
};

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
