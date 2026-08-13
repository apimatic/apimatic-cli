import { expect } from 'chai';
import { buildLanguageEntry, LanguageEntryResult } from '../../../src/types/plugin/language-entry';
import { LanguageEntry } from '../../../src/types/plugin/plugin-config';
import { GitConfiguration, PackageConfigurationData } from '../../../src/types/publish/package-settings-configuration';
import { CodeGenerationVersion, Language } from '../../../src/types/sdk/generate';

const gitConfig = (repositoryName: string, branch = 'main'): GitConfiguration => ({
  isEnabled: true,
  credentialsId: 'creds',
  repositoryName,
  branch
});

// The profile configurations carry a dozen presentational fields the entry never reads.
const packageConfig = (data: object) => data as PackageConfigurationData;

const entryOf = (result: LanguageEntryResult): LanguageEntry => {
  expect(result.kind).to.equal('entry');
  return (result as { kind: 'entry'; entry: LanguageEntry }).entry;
};

describe('buildLanguageEntry', () => {
  describe('source', () => {
    it('resolves a bare repository name against GitHub', () => {
      const result = buildLanguageEntry(
        Language.CSHARP,
        gitConfig('acme/acme-payments-csharp'),
        undefined,
        CodeGenerationVersion.V4
      );

      expect(result).to.deep.equal({
        kind: 'entry',
        entry: {
          source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' },
          version: 'v4'
        }
      });
    });

    it('passes an absolute URL through untouched', () => {
      const result = buildLanguageEntry(
        Language.CSHARP,
        gitConfig('https://gitlab.com/acme/sdk'),
        undefined,
        CodeGenerationVersion.V3
      );

      expect(entryOf(result).source.repositoryUrl).to.equal('https://gitlab.com/acme/sdk');
    });

    it('trims stray slashes off a bare repository name', () => {
      const result = buildLanguageEntry(Language.GO, gitConfig('/acme/sdk/'), undefined, CodeGenerationVersion.V3);

      expect(entryOf(result).source.repositoryUrl).to.equal('https://github.com/acme/sdk');
    });

    it('omits the branch when the profile does not name one', () => {
      const result = buildLanguageEntry(Language.GO, gitConfig('acme/sdk', ''), undefined, CodeGenerationVersion.V3);

      expect(entryOf(result).source.branch).to.be.undefined;
    });

    it('reports no source repository when the profile has no git configuration', () => {
      const result = buildLanguageEntry(Language.CSHARP, undefined, undefined, CodeGenerationVersion.V3);

      expect(result).to.deep.equal({ kind: 'noSourceRepository' });
    });

    it('reports no source repository when the repository name is blank', () => {
      const result = buildLanguageEntry(Language.CSHARP, gitConfig('   '), undefined, CodeGenerationVersion.V3);

      expect(result).to.deep.equal({ kind: 'noSourceRepository' });
    });

    // Nothing downstream validates the URL — the backend checks only that it is non-blank — so a
    // guess would survive all the way to a failed clone. These are refused instead.
    ['git@github.com:acme/sdk.git', 'ssh://git@github.com/acme/sdk', 'acme-payments-csharp'].forEach(
      (repositoryName) => {
        it(`refuses to invent a URL for ${repositoryName}`, () => {
          const result = buildLanguageEntry(
            Language.CSHARP,
            gitConfig(repositoryName),
            undefined,
            CodeGenerationVersion.V3
          );

          expect(result).to.deep.equal({ kind: 'unresolvableRepositoryName', repositoryName });
        });
      }
    );
  });

  describe('package', () => {
    const packageFor = (language: Language, configuration: object) =>
      entryOf(
        buildLanguageEntry(language, gitConfig('acme/sdk'), packageConfig(configuration), CodeGenerationVersion.V3)
      ).package;

    it('names a C# package by its package id', () => {
      expect(packageFor(Language.CSHARP, { packageId: 'Acme.Payments.Sdk' })).to.deep.equal({
        packageId: 'Acme.Payments.Sdk'
      });
    });

    it('names a Java package by both halves of its coordinate', () => {
      expect(packageFor(Language.JAVA, { groupId: 'io.acme', artifactId: 'acme-sdk' })).to.deep.equal({
        groupId: 'io.acme',
        artifactId: 'acme-sdk'
      });
    });

    it('names a PHP package by vendor and project', () => {
      expect(packageFor(Language.PHP, { vendorName: 'acme', projectName: 'sdk' })).to.deep.equal({
        vendorName: 'acme',
        projectName: 'sdk'
      });
    });

    it('names a Go package by its package name', () => {
      expect(packageFor(Language.GO, { packageName: 'acmesdk' })).to.deep.equal({ packageName: 'acmesdk' });
    });

    for (const language of [Language.TYPESCRIPT, Language.PYTHON, Language.RUBY]) {
      it(`names a ${language} package by its single name`, () => {
        expect(packageFor(language, { name: '@acme/sdk' })).to.deep.equal({ name: '@acme/sdk' });
      });
    }

    it('omits the package when the profile configures none', () => {
      const result = buildLanguageEntry(Language.CSHARP, gitConfig('acme/sdk'), undefined, CodeGenerationVersion.V3);

      expect(entryOf(result).package).to.be.undefined;
    });

    it('omits the package when the configuration is missing half its identity', () => {
      expect(packageFor(Language.JAVA, { groupId: 'io.acme' })).to.be.undefined;
    });
  });
});
