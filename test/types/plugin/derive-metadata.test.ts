import { expect } from 'chai';
import { deriveMetadata } from '../../../src/types/plugin/plugin-config';
import { PLUGIN_ID_PATTERN } from '../../../src/types/plugin/plugin-config';

// Quickstart asks two questions and neither is about plugins, so the identity comes from the
// directory the user is standing in. A folder name is not a plugin id, which is what this handles.
describe('deriveMetadata', () => {
  it('takes a kebab-case directory name as the id, unchanged', () => {
    expect(deriveMetadata('petstore-api')).to.deep.equal({
      pluginId: 'petstore-api',
      pluginName: 'petstore-api',
      pluginVersion: '0.1.0'
    });
  });

  // The name is what a reader sees; the id is what `gh repo create` is handed.
  it('keeps the name as typed while the id is made safe', () => {
    const { pluginId, pluginName } = deriveMetadata('Acme Payments');

    expect(pluginId).to.equal('acme-payments');
    expect(pluginName).to.equal('Acme Payments');
  });

  for (const name of ['acme_payments', 'Acme  Payments!', '  petstore.api  ', 'API—Gateway']) {
    it(`makes '${name}' into an id the config will accept`, () => {
      expect(deriveMetadata(name).pluginId).to.match(PLUGIN_ID_PATTERN);
    });
  }

  // Writing an id the config would then refuse is worse than not deriving one.
  it('falls back when the directory name leaves nothing to build an id from', () => {
    expect(deriveMetadata('!!!').pluginId).to.equal('api-plugin');
    expect(deriveMetadata('').pluginId).to.equal('api-plugin');
  });

  it('starts every plugin at its first version', () => {
    expect(deriveMetadata('petstore-api').pluginVersion).to.equal('0.1.0');
  });
});
