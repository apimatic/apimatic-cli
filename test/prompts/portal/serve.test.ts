import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { PortalServePrompts } from '../../../src/prompts/portal/serve.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
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
          '(removes the Context Plugin pages).'
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

    it('says a saved specification updates its reference, and one with a mistake is reported and left out', () => {
      expect(printed()).to.match(
        /Saving a document in '.*spec' updates its API reference; one with a mistake is reported, and left out until it is fixed\./
      );
    });
  });

  describe('a change to which documents are in the spec directory', () => {
    const document = (name: string) => new FilePath(new DirectoryPath('src', 'spec'), new FileName(name));

    /** The warning, then the advice that follows it. */
    const said = (added: string[], removed: string[]) => {
      const warn = sinon.stub(log, 'warn');
      const message = sinon.stub(log, 'message');
      try {
        new PortalServePrompts().specsNeedRestart(
          { added: added.map(document), removed: removed.map(document) },
          new DirectoryPath('src')
        );
        return [warn, message].map((stub) => stripVTControlCharacters(String(stub.firstCall.args[0])));
      } finally {
        sinon.restore();
      }
    };

    it('names each document added and removed, and that a restart shows them', () => {
      const [warning, advice] = said(['orders.json'], ['pets.json']);

      expect(warning).to.match(
        /^The documents in '.*spec' are not the ones the preview started with: 'orders\.json' was added, and 'pets\.json' was removed\.$/
      );
      expect(advice).to.equal(
        'Restart the preview to show them; until then it shows those it started with that are still there.'
      );
    });

    it('lists several documents, and says only what was done', () => {
      expect(said(['a.json', 'b.json'], [])[0]).to.match(/: 'a\.json' and 'b\.json' were added\.$/);
      expect(said([], ['a.json', 'b.json', 'c.json'])[0]).to.match(
        /: 'a\.json', 'b\.json' and 'c\.json' were removed\.$/
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
