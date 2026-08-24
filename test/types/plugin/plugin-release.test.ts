import { expect } from 'chai';
import { PluginRelease } from '../../../src/types/plugin/plugin-release.js';

describe('PluginRelease', () => {
  const create = (pluginId: unknown, pluginVersion: unknown) => PluginRelease.tryCreate(pluginId, pluginVersion);

  describe('tryCreate', () => {
    it('accepts a kebab-case id and a semver version', () => {
      expect(create('acme-payments', '1.0.0')._unsafeUnwrap()).to.not.be.undefined;
    });

    it('accepts a single-word id', () => {
      expect(create('hamza', '0.1.67')._unsafeUnwrap()).to.not.be.undefined;
    });

    it('trims surrounding whitespace before validating', () => {
      const release = create('  acme-payments  ', '  1.0.0  ')._unsafeUnwrap();

      expect(release?.toRepositoryName()).to.equal('acme-payments');
      expect(release?.toTag()).to.equal('v1.0.0');
    });

    ['Acme Payments', 'acme_payments', 'Acme-Payments', 'acme--payments', '-acme', 'acme-'].forEach((pluginId) => {
      it(`refuses '${pluginId}' as a malformed id`, () => {
        expect(create(pluginId, '1.0.0')._unsafeUnwrapErr()).to.contain(`'pluginId'`);
      });
    });

    ['1.2', '1.2.3.4', 'v1.2.3', '1.2.x', 'latest'].forEach((pluginVersion) => {
      it(`refuses '${pluginVersion}' as a malformed version`, () => {
        expect(create('acme-payments', pluginVersion)._unsafeUnwrapErr()).to.contain(`'pluginVersion'`);
      });
    });

    // A hand-edited field is worth reporting even when the other one has yet to be written.
    it('refuses a malformed id whose version is not set yet', () => {
      expect(create('Acme Payments', undefined)._unsafeUnwrapErr()).to.contain(`'pluginId'`);
    });

    it('refuses a malformed version whose id is not set yet', () => {
      expect(create(undefined, '1.2')._unsafeUnwrapErr()).to.contain(`'pluginVersion'`);
    });
  });

  describe('an identity that is not recorded yet', () => {
    [
      ['no id', undefined, '1.0.0'],
      ['a blank id', '   ', '1.0.0'],
      ['an id that is not a string', 7, '1.0.0'],
      ['no version', 'acme-payments', undefined],
      ['a blank version', 'acme-payments', '  '],
      ['neither field', undefined, undefined]
    ].forEach(([label, pluginId, pluginVersion]) => {
      it(`reports no release for ${label}`, () => {
        expect(create(pluginId, pluginVersion)._unsafeUnwrap()).to.be.undefined;
      });
    });
  });

  describe('naming', () => {
    const release = create('acme-payments', '0.1.67')._unsafeUnwrap()!;

    it('names the repository after the plugin id', () => {
      expect(release.toRepositoryName()).to.equal('acme-payments');
    });

    it('reports the version unprefixed', () => {
      expect(release.toVersion()).to.equal('0.1.67');
    });

    it('prefixes the tag with v', () => {
      expect(release.toTag()).to.equal('v0.1.67');
    });
  });
});
