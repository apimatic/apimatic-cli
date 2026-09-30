import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { PortalServePrompts } from '../../../src/prompts/portal/serve.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { UrlPath } from '../../../src/types/file/urlPath.js';
import { Language } from '../../../src/types/sdk/generate.js';

describe('PortalServePrompts', () => {
  afterEach(() => {
    sinon.restore();
  });

  // The note's first line is wider than the test's 80 columns, so it is printed through
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

    it('says a language or the plugin block removed from apimatic.json follows without a restart', () => {
      expect(printed()).to.contain(
        "So does removing a language from 'languages' (updates the SDK pages) or the 'plugin' block " +
          '(removes the Context Plugin tab).'
      );
    });

    // The artifacts are fetched once and Vite reads its base once, so these wait for a restart.
    it('says which edits need the preview restarted', () => {
      expect(printed()).to.match(
        /Restart the preview after adding a language or a 'plugin' block \(its SDK or plugin is fetched at startup\), adding or removing a page, creating '.*static', changing which documents are in '.*spec', or changing the path in 'portal\.site\.url'\./
      );
    });

    it('says a mistake in a page or a nav.json is reported when it is saved, and kept from the preview', () => {
      expect(printed()).to.contain(
        'Mistakes in these files are reported on save, and the preview keeps what it last accepted.'
      );
    });
  });

  describe('an edit that needs artifacts the preview was started without', () => {
    const warned = (sdks: Language[], sdkDocs: Language[], plugin: boolean) => {
      const warn = sinon.stub(log, 'warn');
      try {
        new PortalServePrompts().editNeedsRestart({ sdks, sdkDocs, plugin });
        return stripVTControlCharacters(String(warn.firstCall.args[0]));
      } finally {
        warn.restore();
      }
    };

    it('names what the edit needs, and that a restart fetches it', () => {
      const added = [Language.PYTHON, Language.CSHARP];

      expect(warned(added, added, true)).to.equal(
        "This edit to 'apimatic.json' needs the SDK and SDK docs for 'python', 'csharp' and the context plugin, " +
          'which the preview was started without. Restart the preview to fetch them; until then it keeps showing ' +
          'what it last accepted.'
      );
    });

    it('names an SDK, its docs or the plugin each on its own', () => {
      expect(warned([Language.PYTHON], [], false)).to.contain("needs the SDK for 'python', which");
      expect(warned([], [Language.CSHARP], false)).to.contain("needs the SDK docs for 'csharp', which");
      expect(warned([], [], true)).to.contain('needs the context plugin, which');
      expect(warned([Language.PYTHON], [Language.CSHARP], true)).to.contain(
        "needs the SDK for 'python', the SDK docs for 'csharp' and the context plugin, which"
      );
    });
  });
});
