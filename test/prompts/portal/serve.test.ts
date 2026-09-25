import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { PortalServePrompts } from '../../../src/prompts/portal/serve.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { UrlPath } from '../../../src/types/file/urlPath.js';

describe('PortalServePrompts', () => {
  afterEach(() => {
    sinon.restore();
  });

  // The note's first paragraph is wider than any terminal, so it is printed through
  // `log.message`, which is what this reads.
  describe('the live preview note', () => {
    const printed = () => {
      const message = sinon.stub(log, 'message');
      sinon.stub(log, 'step');
      const write = sinon.stub(process.stdout, 'write').returns(true);
      try {
        new PortalServePrompts().portalServed(new UrlPath('http://127.0.0.1:3000'), new DirectoryPath('src'));
      } finally {
        write.restore();
      }
      return message
        .getCalls()
        .map((call) => stripVTControlCharacters(String(call.args[0])))
        .join('\n');
    };

    it('says the generated pages follow apimatic.json without a restart', () => {
      const note = printed();

      expect(note).to.contain(
        "and so does a language added to or removed from its 'languages' block, which updates the SDK pages"
      );
      expect(note).to.contain("its 'plugin' block added or removed, which adds or removes the Context Plugin tab");
    });

    // Adding one of the user's pages still needs a restart; adding a generated one does not.
    it('says which added pages need the preview restarted', () => {
      expect(printed()).to.match(/Adding or removing a page in '.*content', creating .* needs the preview restarted\./);
    });

    it('says a mistake in a page or a nav.json is reported when it is saved', () => {
      expect(printed()).to.contain("So is a mistake in a page or a 'nav.json'");
    });
  });
});
