import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { GitVersion } from '../../../src/types/git/git-version.js';
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
  it('lists the four that are coming soon', () => {
    const message = messageFor(Language.GO);

    expect(message).to.contain('Coming soon: Java, Ruby, Go, PHP');
  });

  // There is no version to fall back to any more, so nothing may suggest one.
  it('offers no code generator to fall back to', () => {
    const message = messageFor(Language.PHP);

    expect(message).to.not.contain('v3');
    expect(message).to.not.contain('codegen-version');
  });
});

describe('SdkGeneratePrompts, about the destination', () => {
  const root = new DirectoryPath(process.cwd());

  afterEach(() => {
    sinon.restore();
  });

  it('refuses a destination holding the source, and suggests one outside it', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().destinationContainsSource(root.join('src'), root);

    const said = stripVTControlCharacters(error.firstCall.args[0]);
    expect(said).to.contain('contains your source directory');
    expect(said).to.contain('--destination=./sdk');
  });

  it('sends a run that cannot ask about overwriting to a terminal, or to --force', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().cannotAskToOverwrite(root.join('sdk', 'python'));

    const said = stripVTControlCharacters(error.firstCall.args[0]);
    expect(said).to.contain('cannot ask whether to overwrite it');
    expect(said).to.contain('Rerun in a terminal to be asked, or with --force to overwrite.');
  });
});

describe('SdkGeneratePrompts.sdkNotUnzipped', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('says what a bad response says, then why the SDK could not be unzipped', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().sdkNotUnzipped({ kind: 'unzipFailed', reason: 'Invalid or unsupported zip format' });

    expect(error.firstCall.args[0]).to.equal(
      `${ServiceError.InvalidResponse.errorMessage}\nInvalid or unsupported zip format`
    );
  });
});

describe('SdkGeneratePrompts, about git', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('warns what not having git costs, and what a git too old does, naming the version found', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().gitUnavailable();
    new SdkGeneratePrompts().gitVersionNotSupported(GitVersion.parse('git version 2.30.2'));

    expect(stripVTControlCharacters(warn.firstCall.args[0])).to.equal(
      'git is not available, so your customizations to the generated SDK will not persist across regenerations.'
    );
    expect(stripVTControlCharacters(warn.secondCall.args[0])).to.equal(
      'git 2.30.2 was found, but 2.38 or newer is needed, ' +
        'so your customizations to the generated SDK will not persist across regenerations.'
    );
  });
});

describe('SdkGeneratePrompts, about the repository', () => {
  const sdk = new DirectoryPath(process.cwd()).join('sdk', 'python');

  afterEach(() => {
    sinon.restore();
  });

  it('says which repository could not be inspected, in git’s words', () => {
    const error = sinon.stub(log, 'error');

    new SdkGeneratePrompts().repositoryNotInspected(sdk, 'git rev-parse failed: bad config');

    expect(stripVTControlCharacters(error.firstCall.args[0])).to.equal(
      "The git repository in './sdk/python' could not be inspected: git rev-parse failed: bad config"
    );
  });

  it('gives the steps that keep edits, should the developer make any, when the SDK directory is not a repository', () => {
    const write = sinon.stub(process.stdout, 'write').returns(true);
    try {
      new SdkGeneratePrompts().gitInitSteps(sdk);
    } finally {
      write.restore();
    }
    const note = stripVTControlCharacters(write.args.map(([chunk]) => String(chunk)).join(''));

    const order = [
      'Next steps',
      "To customize './sdk/python' and keep your changes when it is regenerated:",
      '1. Rerun with --git-init before you change anything.' +
        ' It makes the folder a git repository of its own, and needs git 2.38 or newer.',
      '2. Then make your changes; each later run merges them into the new generation.'
    ];
    const at = order.map((text) => note.indexOf(text));
    expect(at).to.not.include(-1);
    expect(at).to.deep.equal([...at].sort((a, b) => a - b));
  });

  it('says a repository was initialised, naming the SDK directory', () => {
    const info = sinon.stub(log, 'info');

    new SdkGeneratePrompts().repositoryInitialised(sdk);

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      "Initialised a git repository in './sdk/python', which keeps your customizations across regenerations."
    );
  });

  it('says the SDK was written without a repository when one could not be made, and what the next run does', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().repositoryNotInitialised(sdk, 'git broke');

    expect(stripVTControlCharacters(warn.firstCall.args[0])).to.equal(
      "The SDK was written, but './sdk/python' could not be made a git repository: git broke\n" +
        'The next run will replace the SDK instead of merging your customizations into it.'
    );
  });

  it('says what the next run does without the snapshot: replace the SDK', () => {
    const warn = sinon.stub(log, 'warn');

    new SdkGeneratePrompts().snapshotNotRecorded('git broke');

    expect(stripVTControlCharacters(warn.firstCall.args[0])).to.equal(
      'The SDK was written, but its snapshot could not be recorded: git broke\n' +
        'The next run will replace the SDK instead of merging your customizations into it.'
    );
  });
});
