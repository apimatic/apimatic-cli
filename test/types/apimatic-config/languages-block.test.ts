import { expect } from 'chai';
import { buildLanguageEntry } from '../../../src/types/apimatic-config/languages-block';
import {
  CSharpPackageConfiguration,
  GitConfiguration,
  PackageConfigurationForLanguage
} from '../../../src/types/publish/package-settings-configuration';
import { SemVersion } from '../../../src/types/publish/version';
import { Language } from '../../../src/types/sdk/generate';

const gitConfig = (repositoryName: string, branch = 'main'): GitConfiguration => ({
  isEnabled: true,
  credentialsId: 'creds',
  repositoryName,
  branch
});

const VERSION = SemVersion.tryCreate('1.2.3')._unsafeUnwrap();

const CSHARP_CONFIGURATION = {
  packageId: 'Acme.Payments.Sdk',
  authors: 'Acme',
  description: null,
  title: null,
  packageTags: null,
  repositoryUrl: null,
  repositoryType: null,
  packageProjectUrl: null,
  packageIcon: null,
  packageReleaseNotes: null,
  copyright: null
} satisfies CSharpPackageConfiguration;

describe('buildLanguageEntry', () => {
  describe('source', () => {
    it('resolves a repository name against GitHub', () => {
      const result = buildLanguageEntry(Language.CSHARP, gitConfig('acme/acme-payments-csharp'), undefined, VERSION);

      expect(result.publishing?.source).to.deep.equal({
        repositoryUrl: 'https://github.com/acme/acme-payments-csharp',
        branch: 'main'
      });
    });

    it('omits the branch when the profile does not name one', () => {
      const result = buildLanguageEntry(Language.GO, gitConfig('acme/sdk', ''), undefined, VERSION);

      expect(result.publishing?.source?.branch).to.be.undefined;
    });

    it('omits the source when the profile has no git configuration', () => {
      expect(buildLanguageEntry(Language.CSHARP, undefined, undefined, VERSION).publishing?.source).to.be.undefined;
    });

    it('omits the source when the repository name is blank', () => {
      expect(buildLanguageEntry(Language.CSHARP, gitConfig('   '), undefined, VERSION).publishing?.source).to.be
        .undefined;
    });
  });

  // The service reads the package's name out of the configuration, so it is written through as the
  // profile holds it rather than picked apart into a name this CLI chose a shape for.
  describe('package configuration', () => {
    it('writes the profile configuration as it stands', () => {
      const result = buildLanguageEntry(Language.CSHARP, gitConfig('acme/sdk'), CSHARP_CONFIGURATION, VERSION);

      expect(result.publishing?.packageConfiguration).to.deep.equal(CSHARP_CONFIGURATION);
    });

    it('carries each language its own shape', () => {
      const npm = { name: '@acme/sdk' } as PackageConfigurationForLanguage[Language.TYPESCRIPT];

      const result = buildLanguageEntry(Language.TYPESCRIPT, gitConfig('acme/sdk'), npm, VERSION);

      expect(result.publishing?.packageConfiguration).to.deep.equal(npm);
    });

    // Written even when nothing was released: it says how the package is set up, not that one
    // exists, and the service requires it beside any publishing block.
    it('writes the configuration for a source-only publish', () => {
      const result = buildLanguageEntry(Language.CSHARP, gitConfig('acme/sdk'), CSHARP_CONFIGURATION, undefined);

      expect(result.publishing?.packageConfiguration).to.deep.equal(CSHARP_CONFIGURATION);
      expect(result.publishing?.package).to.be.undefined;
    });

    it('omits the configuration when the profile has none', () => {
      const result = buildLanguageEntry(Language.CSHARP, gitConfig('acme/sdk'), undefined, VERSION);

      expect(result.publishing?.packageConfiguration).to.be.undefined;
    });
  });

  // The version rides in `package`, which is all a release records: the name is in the
  // configuration, so there is nothing else for it to carry.
  describe('release', () => {
    it('records the published version and nothing else', () => {
      const result = buildLanguageEntry(Language.CSHARP, gitConfig('acme/sdk'), CSHARP_CONFIGURATION, VERSION);

      expect(result.publishing?.package).to.deep.equal({ version: '1.2.3' });
    });

    it('records no release when nothing was published', () => {
      const result = buildLanguageEntry(Language.PYTHON, gitConfig('acme/sdk'), undefined, undefined);

      expect(result.publishing?.package).to.be.undefined;
    });
  });
});
