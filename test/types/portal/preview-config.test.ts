import { expect } from 'chai';
import { PortalConfig } from '../../../src/types/portal/portal-config';
import { PreviewConfig } from '../../../src/types/portal/preview-config';

describe('PreviewConfig', () => {
  const config = (block: object) => PortalConfig.fromBlock(block, { name: 'Pets', description: null })._unsafeUnwrap();
  const named = (name: string) => config({ site: { name } });
  const grouped = (groupBy: string) => config({ api: { groupBy } });
  const withLogo = (name: string) => config({ site: { name }, brand: { logo: 'static/logo.png' } });

  const quiet = { restartNeeded: false, staticDirectoryNotServed: false };

  it('has nothing to say about an edit that changes neither the API settings nor the static files', () => {
    expect(new PreviewConfig(named('Pets'), false).noticesFor(named('Cats'))).to.deep.equal(quiet);
  });

  describe('a change to portal.api', () => {
    it('needs a restart, said on the save that makes it and not on the next', () => {
      const preview = new PreviewConfig(grouped('tag'), true);

      expect(preview.noticesFor(grouped('route')).restartNeeded).to.equal(true);
      preview.show(grouped('route'), true);
      expect(preview.noticesFor(grouped('route')).restartNeeded).to.equal(false);
    });

    it('needs none once put back to what the preview started with', () => {
      const preview = new PreviewConfig(grouped('tag'), true);
      preview.show(grouped('route'), true);

      expect(preview.noticesFor(grouped('tag')).restartNeeded).to.equal(false);
    });

    it('is said again for an edit that was never shown', () => {
      const preview = new PreviewConfig(grouped('tag'), true);
      preview.noticesFor(grouped('route'));

      expect(preview.noticesFor(grouped('route')).restartNeeded).to.equal(true);
    });
  });

  describe('a static file named while the static directory is not served', () => {
    it('is said on the save that first names one, and not on the next', () => {
      const preview = new PreviewConfig(named('Pets'), false);

      expect(preview.noticesFor(withLogo('Pets')).staticDirectoryNotServed).to.equal(true);
      preview.show(withLogo('Pets'), true);
      expect(preview.noticesFor(withLogo('Cats')).staticDirectoryNotServed).to.equal(false);
    });

    it('is not said when the directory is served', () => {
      expect(new PreviewConfig(named('Pets'), true).noticesFor(withLogo('Pets'))).to.deep.equal(quiet);
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
