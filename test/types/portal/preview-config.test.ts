import { expect } from 'chai';
import { PortalConfig } from '../../../src/types/portal/portal-config';
import { PreviewConfig } from '../../../src/types/portal/preview-config';

describe('PreviewConfig', () => {
  const config = (block: object) => PortalConfig.fromBlock(block, { name: 'Pets', description: null })._unsafeUnwrap();
  const named = (name: string) => config({ site: { name } });
  const withLogo = (name: string) => config({ site: { name }, brand: { logo: 'static/logo.png' } });

  describe('a static file named while the static directory is not served', () => {
    it('is said on the save that first names one, and not on the next', () => {
      const preview = new PreviewConfig(named('Pets'), false);

      expect(preview.staticDirectoryNotServed(withLogo('Pets'))).to.equal(true);
      preview.show(withLogo('Pets'), true);
      expect(preview.staticDirectoryNotServed(withLogo('Cats'))).to.equal(false);
    });

    it('is not said when the directory is served', () => {
      expect(new PreviewConfig(named('Pets'), true).staticDirectoryNotServed(withLogo('Pets'))).to.equal(false);
    });

    it('is not said for an edit that names no static file', () => {
      expect(new PreviewConfig(named('Pets'), false).staticDirectoryNotServed(named('Cats'))).to.equal(false);
    });
  });

  describe('whether to say an edit was applied', () => {
    it('says so when the edit wrote something', () => {
      expect(new PreviewConfig(named('Pets'), false).show(named('Cats'), true)).to.equal(true);
    });

    it('stays quiet when it wrote nothing', () => {
      expect(new PreviewConfig(named('Pets'), false).show(named('Pets'), false)).to.equal(false);
    });

    it('says so after a refusal even when nothing was written, and only once', () => {
      const preview = new PreviewConfig(named('Pets'), false);
      preview.refuse();

      expect(preview.show(named('Pets'), false)).to.equal(true);
      expect(preview.show(named('Pets'), false)).to.equal(false);
    });
  });
});
