import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { VersionProblem } from '../../../src/types/project-context.js';
import { Language } from '../../../src/types/sdk/generate.js';

describe('SdkGeneratePrompts.languageNotAvailable', () => {
  const prompts = new SdkGeneratePrompts();
  let error: sinon.SinonStub;

  beforeEach(() => {
    error = sinon.stub(log, 'error');
  });

  afterEach(() => {
    error.restore();
  });

  const messageFor = (language: Language): string => {
    prompts.languageNotAvailable(language);
    return error.firstCall.args[0] as string;
  };

  // The language the user asked for, under the name the rest of the CLI shows it by — not the
  // flag value they typed, which is how every other list in this CLI would render it.
  it('names the language that was asked for', () => {
    expect(messageFor(Language.RUBY)).to.contain("Ruby isn't available yet.");
  });

  it('lists the three that can be generated now', () => {
    const message = messageFor(Language.JAVA);

    expect(message).to.contain('Available now: C#, TypeScript, Python');
  });

  // Naming them is the difference between "not yet" and "not ever", and the four that left with
  // v3 are coming back.
  it('lists the four that are on their way', () => {
    const message = messageFor(Language.GO);

    expect(message).to.contain('Coming soon: Ruby, Java, PHP, Go');
  });

  // There is no version to fall back to any more, so nothing may suggest one.
  it('offers no code generator to fall back to', () => {
    const message = messageFor(Language.PHP);

    expect(message).to.not.contain('v3');
    expect(message).to.not.contain('codegen-version');
  });
});

describe('SdkGeneratePrompts.noVersionToBuild', () => {
  const prompts = new SdkGeneratePrompts();
  const sourceDirectory = new DirectoryPath(path.resolve('project', 'src'));
  let error: sinon.SinonStub;

  beforeEach(() => {
    error = sinon.stub(log, 'error');
  });

  afterEach(() => {
    error.restore();
  });

  const messageFor = (problem: VersionProblem): string => {
    prompts.noVersionToBuild(problem, sourceDirectory);
    return stripVTControlCharacters(error.firstCall.args[0] as string);
  };

  it('names the source directory when it holds no versions', () => {
    expect(messageFor('noVersions')).to.equal(
      `The 'versioned_docs' directory is either empty or invalid: '${sourceDirectory}'`
    );
  });

  it('says the chosen version is not one of them', () => {
    expect(messageFor('versionNotFound')).to.equal('The selected API version is invalid.');
  });
});
