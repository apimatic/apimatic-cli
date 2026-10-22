import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { SdkGeneratePrompts } from '../../../src/prompts/sdk/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { VersionProblem } from '../../../src/types/project-context.js';
import { Language } from '../../../src/types/sdk/generate.js';
import { RelativeFilePath } from '../../../src/types/file/relativeFilePath.js';
import { ConflictKind, MergePlan } from '../../../src/types/sdk/merge-plan.js';

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

const rel = (value: string) => RelativeFilePath.fromGit(value);

const plan = (
  files: Partial<Record<keyof MergePlan['files'], string[]>>,
  conflicts: { path: string; kind: ConflictKind }[] = []
) =>
  new MergePlan(
    [],
    [],
    conflicts.map((conflict) => ({ ...conflict, path: rel(conflict.path) })),
    [],
    {
      added: [],
      updated: [],
      merged: [],
      removed: [],
      kept: [],
      unchanged: [],
      ...Object.fromEntries(Object.entries(files).map(([kind, paths]) => [kind, paths.map(rel)]))
    }
  );

describe('SdkGeneratePrompts.sdkMerged', () => {
  const root = new DirectoryPath(process.cwd());
  const sdk = root.join('sdk', 'typescript');

  afterEach(() => {
    sinon.restore();
  });

  it('counts the generator’s files and names yours, relative to where the command ran', () => {
    const info = sinon.stub(log, 'info');

    new SdkGeneratePrompts().sdkMerged(
      sdk,
      plan({
        added: ['src/models/author.ts'],
        updated: ['README.md', 'src/client.ts'],
        merged: ['src/models/book.ts'],
        kept: ['src/resources/books.ts', 'docs/pricing.md']
      })
    );

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      [
        "Regenerated the SDK at './sdk/typescript': 1 file added and 2 files updated.",
        'Merged with your changes:',
        "  './sdk/typescript/src/models/book.ts'",
        'Kept as yours:',
        "  './sdk/typescript/src/resources/books.ts'",
        "  './sdk/typescript/docs/pricing.md'"
      ].join('\n')
    );
  });

  it('still names your files when the generator changed nothing, since they are what the next run will merge', () => {
    const info = sinon.stub(log, 'info');

    new SdkGeneratePrompts().sdkMerged(sdk, plan({ unchanged: ['README.md'], kept: ['src/models/book.ts'] }));

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      [
        "Regenerated the SDK at './sdk/typescript': nothing changed.",
        'Kept as yours:',
        "  './sdk/typescript/src/models/book.ts'"
      ].join('\n')
    );
  });

  it('counts the conflicted files in the headline, so it never says nothing changed above a conflict', () => {
    const info = sinon.stub(log, 'info');

    new SdkGeneratePrompts().sdkMerged(
      sdk,
      plan({}, [{ path: 'src/resources/authors.ts', kind: 'noLongerGenerated' }])
    );

    expect(stripVTControlCharacters(info.firstCall.args[0])).to.equal(
      "Regenerated the SDK at './sdk/typescript': 1 file in conflict."
    );
  });
});
