import { expect } from 'chai';
import { PluginRelease } from '../../../src/types/plugin/plugin-release.js';

describe('PluginRelease', () => {
  const create = (pluginId: string | undefined, pluginVersion: string | undefined) =>
    PluginRelease.create(pluginId, pluginVersion);

  describe('create', () => {
    it('accepts a kebab-case id and a semver version', () => {
      const release = create('acme-payments', '1.0.0');

      expect(release.isOk()).to.be.true;
    });

    it('accepts a single-word id', () => {
      expect(create('hamza', '0.1.67').isOk()).to.be.true;
    });

    it('trims surrounding whitespace before validating', () => {
      const release = create('  acme-payments  ', '  1.0.0  ');

      expect(release.isOk()).to.be.true;
      expect(release._unsafeUnwrap().toRepositoryName()).to.equal('acme-payments');
      expect(release._unsafeUnwrap().toTag()).to.equal('v1.0.0');
    });

    it('reports a missing id', () => {
      expect(create(undefined, '1.0.0')._unsafeUnwrapErr()).to.deep.equal({
        field: 'pluginId',
        reason: 'missing'
      });
    });

    it('reports a blank id as missing', () => {
      expect(create('   ', '1.0.0')._unsafeUnwrapErr()).to.deep.equal({ field: 'pluginId', reason: 'missing' });
    });

    ['Acme Payments', 'acme_payments', 'Acme-Payments', 'acme--payments', '-acme', 'acme-'].forEach((pluginId) => {
      it(`reports '${pluginId}' as a malformed id`, () => {
        expect(create(pluginId, '1.0.0')._unsafeUnwrapErr()).to.deep.equal({
          field: 'pluginId',
          reason: 'malformed'
        });
      });
    });

    it('reports a missing version', () => {
      expect(create('acme-payments', undefined)._unsafeUnwrapErr()).to.deep.equal({
        field: 'pluginVersion',
        reason: 'missing'
      });
    });

    it('reports a blank version as missing', () => {
      expect(create('acme-payments', '  ')._unsafeUnwrapErr()).to.deep.equal({
        field: 'pluginVersion',
        reason: 'missing'
      });
    });

    ['1.2', '1.2.3.4', 'v1.2.3', '1.2.x', 'latest'].forEach((pluginVersion) => {
      it(`reports '${pluginVersion}' as a malformed version`, () => {
        expect(create('acme-payments', pluginVersion)._unsafeUnwrapErr()).to.deep.equal({
          field: 'pluginVersion',
          reason: 'malformed'
        });
      });
    });

    // The id is reported first so a caller fixing one field at a time is not sent to the version
    // while the id is also unusable.
    it('reports the id when both fields are unusable', () => {
      expect(create(undefined, undefined)._unsafeUnwrapErr().field).to.equal('pluginId');
    });
  });

  describe('naming', () => {
    const release = create('acme-payments', '0.1.67')._unsafeUnwrap();

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
