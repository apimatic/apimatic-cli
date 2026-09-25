import { expect } from 'chai';
import { PortalSdk } from '../../../src/types/portal/portal-sdk';
import { Language } from '../../../src/types/sdk/generate';

describe('PortalSdk', () => {
  const released = (language: Language, packageConfiguration: object) =>
    PortalSdk.fromEntry(language, { publishing: { package: { version: '2.1.0' }, packageConfiguration } }).release();

  it('reads a wanted language with no publishing record as nothing recorded', () => {
    const sdk = PortalSdk.fromEntry(Language.TYPESCRIPT, {});

    expect(sdk.language).to.equal(Language.TYPESCRIPT);
    expect(sdk.sourceRepository()).to.be.null;
    expect(sdk.release()).to.be.null;
  });

  it('keeps the source repository a publish recorded', () => {
    const sdk = PortalSdk.fromEntry(Language.PYTHON, {
      publishing: { source: { repositoryUrl: 'https://github.com/acme/calc-py', branch: 'main' } }
    });

    expect(`${sdk.sourceRepository()}`).to.equal('https://github.com/acme/calc-py');
  });

  describe('the released package, at its public registry', () => {
    it('is on npm for TypeScript, keeping a scoped name as npm addresses it', () => {
      const release = released(Language.TYPESCRIPT, { name: '@acme/calculator' });

      expect(release?.version).to.equal('2.1.0');
      expect(release?.package.name).to.equal('@acme/calculator');
      expect(release?.package.registry).to.equal('npm');
      expect(`${release?.package.url}`).to.equal('https://www.npmjs.com/package/@acme/calculator');
    });

    it('is on PyPI for Python', () => {
      const release = released(Language.PYTHON, { name: 'acme-calculator' });

      expect(release?.package.registry).to.equal('PyPI');
      expect(`${release?.package.url}`).to.equal('https://pypi.org/project/acme-calculator/');
    });

    it('is on NuGet for C#, named by its package id', () => {
      const release = released(Language.CSHARP, { packageId: 'Acme.Calculator', title: 'Calculator' });

      expect(release?.package.name).to.equal('Acme.Calculator');
      expect(release?.package.registry).to.equal('NuGet');
      expect(`${release?.package.url}`).to.equal('https://www.nuget.org/packages/Acme.Calculator');
    });

    it('encodes what an address cannot carry as it is', () => {
      expect(`${released(Language.PYTHON, { name: 'calc tools' })?.package.url}`).to.equal(
        'https://pypi.org/project/calc%20tools/'
      );
    });
  });

  describe('reads as not released', () => {
    it('without a recorded version, which a source-only publish leaves out', () => {
      const sdk = PortalSdk.fromEntry(Language.TYPESCRIPT, {
        publishing: { packageConfiguration: { name: '@acme/calculator' } }
      });

      expect(sdk.release()).to.be.null;
    });

    it('when the configuration does not name the package', () => {
      expect(released(Language.TYPESCRIPT, { description: 'A calculator.' })).to.be.null;
      expect(released(Language.CSHARP, { name: 'Acme.Calculator' })).to.be.null;
      expect(released(Language.PYTHON, { name: '  ' })).to.be.null;
    });

    it('for a language with no registry the portal knows', () => {
      expect(released(Language.GO, { packageName: 'calculator' })).to.be.null;
    });
  });

  // The document checks the entry and its record are objects; below that the portal reads leniently.
  it('reads a field of the wrong shape as not recorded', () => {
    const sdk = PortalSdk.fromEntry(Language.TYPESCRIPT, {
      publishing: { source: 'github.com/acme/calc', package: { version: 2 }, packageConfiguration: { name: 7 } }
    });

    expect(sdk.sourceRepository()).to.be.null;
    expect(sdk.release()).to.be.null;
    expect(
      PortalSdk.fromEntry(Language.TYPESCRIPT, {
        publishing: { source: { repositoryUrl: 'not a url' } }
      }).sourceRepository()
    ).to.be.null;
  });
});
