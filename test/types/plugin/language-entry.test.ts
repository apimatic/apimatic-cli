import { expect } from 'chai';
import { buildLanguageEntry } from '../../../src/types/plugin/language-entry';
import { GitConfiguration, PackageConfigurationData } from '../../../src/types/publish/package-settings-configuration';
import { SemVersion } from '../../../src/types/publish/version';
import { CodeGenerationVersion, Language } from '../../../src/types/sdk/generate';

const gitConfig = (repositoryName: string, branch = 'main'): GitConfiguration => ({
  isEnabled: true,
  credentialsId: 'creds',
  repositoryName,
  branch
});

// The profile configurations carry a dozen presentational fields the entry never reads.
const packageConfig = (data: object) => data as PackageConfigurationData;

const VERSION = SemVersion.tryCreate('1.2.3')._unsafeUnwrap();

describe('buildLanguageEntry', () => {
  describe('source', () => {
    it('resolves a repository name against GitHub', () => {
      const result = buildLanguageEntry(
        Language.CSHARP,
        gitConfig('acme/acme-payments-csharp'),
        undefined,
        VERSION,
        CodeGenerationVersion.V4
      );

      expect(result).to.deep.equal({
        csharp: {
          source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' },
          package: undefined,
          codegenVersion: 'v4'
        }
      });
    });

    it('omits the branch when the profile does not name one', () => {
      const result = buildLanguageEntry(
        Language.GO,
        gitConfig('acme/sdk', ''),
        undefined,
        VERSION,
        CodeGenerationVersion.V3
      );

      expect(result.go?.source?.branch).to.be.undefined;
    });

    it('omits the source when the profile has no git configuration', () => {
      const result = buildLanguageEntry(Language.CSHARP, undefined, undefined, VERSION, CodeGenerationVersion.V3);

      expect(result.csharp?.source).to.be.undefined;
    });

    it('omits the source when the repository name is blank', () => {
      const result = buildLanguageEntry(Language.CSHARP, gitConfig('   '), undefined, VERSION, CodeGenerationVersion.V3);

      expect(result.csharp?.source).to.be.undefined;
    });
  });

  describe('package', () => {
    const packageFor = (language: Language, configuration: object) =>
      buildLanguageEntry(language, gitConfig('acme/sdk'), packageConfig(configuration), VERSION, CodeGenerationVersion.V3)[
        language
      ]?.package;

    it('names a C# package by its package id', () => {
      expect(packageFor(Language.CSHARP, { packageId: 'Acme.Payments.Sdk' })).to.deep.equal({
        packageId: 'Acme.Payments.Sdk',
        version: '1.2.3'
      });
    });

    it('names a Java package by both halves of its coordinate', () => {
      expect(packageFor(Language.JAVA, { groupId: 'io.acme', artifactId: 'acme-sdk' })).to.deep.equal({
        groupId: 'io.acme',
        artifactId: 'acme-sdk',
        version: '1.2.3'
      });
    });

    it('names a PHP package by vendor and project', () => {
      expect(packageFor(Language.PHP, { vendorName: 'acme', projectName: 'sdk' })).to.deep.equal({
        vendorName: 'acme',
        projectName: 'sdk',
        version: '1.2.3'
      });
    });

    it('names a Go package by its package name', () => {
      expect(packageFor(Language.GO, { packageName: 'acmesdk' })).to.deep.equal({
        packageName: 'acmesdk',
        version: '1.2.3'
      });
    });

    for (const language of [Language.TYPESCRIPT, Language.PYTHON, Language.RUBY]) {
      it(`names a ${language} package by its single name`, () => {
        expect(packageFor(language, { name: '@acme/sdk' })).to.deep.equal({ name: '@acme/sdk', version: '1.2.3' });
      });
    }

    // The version rides inside the package block, so this is also the case that records no version.
    it('omits the package when the profile configures none', () => {
      const result = buildLanguageEntry(Language.CSHARP, gitConfig('acme/sdk'), undefined, VERSION, CodeGenerationVersion.V3);

      expect(result.csharp?.package).to.be.undefined;
    });

    it('omits the package when the configuration is missing half its identity', () => {
      expect(packageFor(Language.JAVA, { groupId: 'io.acme' })).to.be.undefined;
    });
  });
});
