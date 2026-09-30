import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { PortalGeneratePrompts } from '../../../src/prompts/portal/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { SiteAddress } from '../../../src/types/portal/config/site-address.js';

describe('PortalGeneratePrompts', () => {
  describe('the next steps', () => {
    const portal = new DirectoryPath('portal');

    // Boxed or not depending on the terminal's width, but each sentence stays on a line of its own.
    const printed = (zipped: boolean, url: string | null) => {
      const site = url === null ? null : SiteAddress.parse(url, 'portal.site.url')._unsafeUnwrap();
      const write = sinon.stub(process.stdout, 'write').returns(true);
      try {
        new PortalGeneratePrompts().nextSteps(portal, zipped, site);
      } finally {
        write.restore();
      }
      return stripVTControlCharacters(write.args.map(([chunk]) => String(chunk)).join(''));
    };

    it('sends a portal at the root of a host, or with no address, to any static host', () => {
      for (const url of ['https://docs.example.com', null]) {
        const note = printed(false, url);

        expect(note).to.contain(`Upload the contents of '${portal}' to any static host.`);
        expect(note).to.contain("Configure '404.html' as the error document so deep links resolve.");
        expect(note).to.not.contain('robots.txt');
      }
    });

    it('says where to unpack the archive at the root', () => {
      expect(printed(true, 'https://docs.example.com')).to.contain(
        `Unpack 'portal.zip' in '${portal}' onto any static host.`
      );
    });

    // Its styles and scripts are requested under the path, so served anywhere else it loads without them.
    it('says a portal under a path must be served there, with 404.html for the pages under it', () => {
      const note = printed(false, 'https://acme.github.io/docs/');

      expect(note).to.contain(`Upload the contents of '${portal}' so they are served at https://acme.github.io/docs/.`);
      expect(note).to.contain("Serve '404.html' for missing pages under '/docs/', so deep links resolve.");
      expect(note).to.not.contain('any static host');
    });

    it('says where to unpack the archive under a path', () => {
      expect(printed(true, 'https://acme.github.io/docs')).to.contain(
        `Unpack 'portal.zip' in '${portal}' so its contents are served at https://acme.github.io/docs/.`
      );
    });

    it('says why a portal under a path has no robots.txt, and what to add at the root', () => {
      expect(printed(false, 'https://acme.github.io/docs')).to.contain(
        "Crawlers read 'robots.txt' only at the root of a host, so none is generated. If you control the root, " +
          "add 'Sitemap: https://acme.github.io/docs/sitemap.xml' to its 'robots.txt'."
      );
    });
  });
});
