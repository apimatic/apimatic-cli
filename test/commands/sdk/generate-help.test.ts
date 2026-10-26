import { expect } from 'chai';
import SdkGenerate from '../../../src/commands/sdk/generate.js';

describe('sdk generate --help', () => {
  it('names the languages available now and the ones coming soon', () => {
    expect(SdkGenerate.description).to.contain(
      'C#, TypeScript and Python are available; Java, Ruby, Go and PHP are coming soon.'
    );
  });
});
