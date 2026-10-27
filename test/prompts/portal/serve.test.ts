import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { PortalServePrompts } from '../../../src/prompts/portal/serve.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { UrlPath } from '../../../src/types/file/urlPath.js';
import { ContentNotices } from '../../../src/types/portal/content-notices.js';
import { PortalSourceProblem } from '../../../src/types/portal/portal-source.js';
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
        /Restart the preview after adding a language or a 'plugin' block \(its SDK or plugin is fetched at startup\), adding or removing a page, creating '.*static', changing which documents are in '.*spec' or which folders its 'APIMATIC-META\.json' merges, or changing the path in 'portal\.site\.url'\./
      );
    });

    it('says a mistake in a page or a nav.json is reported when it is saved, and kept from the preview', () => {
      expect(printed()).to.contain(
        'Mistakes in these files are reported on save, and the preview keeps what it last accepted.'
      );
    });

    it('says a saved specification updates its reference, and what it cannot read is reported and left out', () => {
      expect(printed()).to.match(
        /Saving a document in '.*spec' updates its API reference; a mistake is reported on save, and the preview leaves what it cannot read out of the reference until it is fixed\./
      );
    });
  });

  /** The last line `log[level]` printed for `say`, without its colours. */
  const lastLine = (level: 'warn' | 'message', say: (prompts: PortalServePrompts) => void) => {
    const stubs = {
      warn: sinon.stub(log, 'warn'),
      message: sinon.stub(log, 'message'),
      error: sinon.stub(log, 'error')
    };
    say(new PortalServePrompts());
    return stripVTControlCharacters(String(stubs[level].lastCall.args[0]));
  };

  // Content keeps what it last accepted; a specification has no earlier version to keep.
  it('says the preview shows what it can still read of a refused specification, and that a build would stop', () => {
    const problem: PortalSourceProblem = { kind: 'emptySpecDirectory', folders: [] };

    expect(lastLine('message', (prompts) => prompts.specRejected(problem, new DirectoryPath('src')))).to.match(
      /^The preview shows what it can still read until '.*spec' is fixed; a build would stop here\.$/
    );
  });

  describe('a watch that cannot start, or stops', () => {
    const source = new DirectoryPath('src');
    const cases: [string, (prompts: PortalServePrompts) => void, RegExp][] = [
      [
        'apimatic.json, at the start',
        (prompts) => prompts.notWatched('config', 'EMFILE', source),
        /^'apimatic\.json' cannot be watched \(EMFILE\), so edits to it need the preview restarted\.$/
      ],
      [
        'apimatic.json, while serving',
        (prompts) => prompts.watchFailed('config', 'EPERM', source),
        /^'apimatic\.json' is no longer watched \(EPERM\), so edits to it need the preview restarted\.$/
      ],
      [
        'the content, at the start',
        (prompts) => prompts.notWatched('content', 'EMFILE', source),
        /^'.*content' cannot be watched \(EMFILE\), so a mistake in a page or a 'nav\.json' is only reported when the preview is restarted\.$/
      ],
      [
        'the content, while serving',
        (prompts) => prompts.watchFailed('content', 'EPERM', source),
        /^'.*content' is no longer watched \(EPERM\), so a mistake in a page or a 'nav\.json' is only reported when the preview is restarted\.$/
      ],
      [
        'the specifications, at the start',
        (prompts) => prompts.notWatched('spec', 'EMFILE', source),
        /^'.*spec' cannot be watched \(EMFILE\), so a mistake in a specification is only reported when the preview is restarted\.$/
      ],
      [
        'the specifications, while serving',
        (prompts) => prompts.watchFailed('spec', 'EPERM', source),
        /^'.*spec' is no longer watched \(EPERM\), so a mistake in a specification is only reported when the preview is restarted\.$/
      ]
    ];

    cases.forEach(([label, say, expected]) => {
      it(`says what is no longer reported on save for ${label}`, () => {
        expect(lastLine('warn', say)).to.match(expected);
      });
    });
  });

  describe('a change it accepted that could not be applied to the preview', () => {
    const source = new DirectoryPath('src');

    it('names apimatic.json, and why', () => {
      expect(lastLine('warn', (prompts) => prompts.notApplied('config', 'EACCES', source))).to.equal(
        "The changes to 'apimatic.json' could not be applied to the preview: EACCES"
      );
    });

    it('names the content directory, and why', () => {
      expect(lastLine('warn', (prompts) => prompts.notApplied('content', 'EBUSY', source))).to.match(
        /^The changes to '.*content' could not be applied to the preview: EBUSY$/
      );
    });
  });

  describe('a change to which documents are read from the spec directory', () => {
    const document = (name: string) => FilePath.resolve(new DirectoryPath('src', 'spec'), name);

    /** The warning, then the advice that follows it. */
    const said = (added: string[], removed: string[]) => {
      const warn = sinon.stub(log, 'warn');
      const message = sinon.stub(log, 'message');
      try {
        new PortalServePrompts().specsShown(
          { fixed: false, change: { added: added.map(document), removed: removed.map(document) } },
          new DirectoryPath('src')
        );
        return [warn, message].map((stub) => stripVTControlCharacters(String(stub.firstCall.args[0])));
      } finally {
        sinon.restore();
      }
    };

    // Whether a file was added or removed, or `APIMATIC-META.json` changed which folders merge.
    it('names each document now read and no longer read, and that a restart matches them', () => {
      const [warning, advice] = said(['orders.json'], ['pets.json']);

      expect(warning).to.match(
        /^The documents read from '.*spec' are not the ones the preview started with: 'orders\.json' is now read, and 'pets\.json' is no longer read\.$/
      );
      expect(advice).to.equal(
        'Restart the preview to match them; until then it shows the ones it started with that are still there.'
      );
    });

    it('lists several documents, and says only what changed', () => {
      expect(said(['a.json', 'b.json'], [])[0]).to.match(/: 'a\.json' and 'b\.json' are now read\.$/);
      expect(said([], ['a.json', 'b.json', 'c.json'])[0]).to.match(
        /: 'a\.json', 'b\.json' and 'c\.json' are no longer read\.$/
      );
    });

    it('says when the documents are the ones it started with again, which needs no restart', () => {
      const success = sinon.stub(log, 'success');
      const warn = sinon.stub(log, 'warn');

      new PortalServePrompts().specsShown(
        { fixed: false, change: { added: [], removed: [] } },
        new DirectoryPath('src')
      );

      expect(warn.called).to.be.false;
      expect(stripVTControlCharacters(String(success.firstCall.args[0]))).to.match(
        /^The documents read from '.*spec' are the ones the preview started with again; it no longer needs a restart\.$/
      );
    });

    // Each folder `APIMATIC-META.json` merges may hold an `openapi.yaml`.
    it('names a document in a folder by its path from the spec directory', () => {
      expect(said(['payments/openapi.yaml'], ['orders/openapi.yaml'])[0]).to.match(
        /: 'payments\/openapi\.yaml' is now read, and 'orders\/openapi\.yaml' is no longer read\.$/
      );
    });
  });

  describe('a save the preview accepts', () => {
    const NO_NOTICES: ContentNotices = {
      droppedTags: [],
      hiddenPages: [],
      ignoredNavigationFiles: [],
      sharedTabNames: [],
      noTabsListed: undefined,
      unseenHomeTitle: undefined
    };

    /** What `show` says succeeded, without its colours. */
    const succeeded = (show: (prompts: PortalServePrompts, source: DirectoryPath) => void) => {
      const success = sinon.stub(log, 'success');
      try {
        show(new PortalServePrompts(), new DirectoryPath('src'));
        return success.getCalls().map((call) => stripVTControlCharacters(String(call.args[0])));
      } finally {
        success.restore();
      }
    };

    it('says the content or the specifications are fixed, when the save fixes one refused', () => {
      const content = succeeded((prompts, source) =>
        prompts.contentShown({ fixed: true, notices: NO_NOTICES }, source)
      );
      const specs = succeeded((prompts, source) => prompts.specsShown({ fixed: true, change: null }, source));

      expect(content).to.have.length(1);
      expect(content[0]).to.match(/^'.*content' is fixed; a build would accept it again\.$/);
      expect(specs).to.have.length(1);
      expect(specs[0]).to.match(/^'.*spec' is fixed; a build would accept it again\.$/);
    });

    it('says nothing of a save that fixes nothing', () => {
      const content = succeeded((prompts, source) =>
        prompts.contentShown({ fixed: false, notices: NO_NOTICES }, source)
      );
      const specs = succeeded((prompts, source) => prompts.specsShown({ fixed: false, change: null }, source));

      expect([...content, ...specs]).to.be.empty;
    });

    it('says the changes to apimatic.json were applied only when the preview says to', () => {
      expect(succeeded((prompts) => prompts.configShown(true))).to.deep.equal([
        "Applied the changes to 'apimatic.json'."
      ]);
      expect(succeeded((prompts) => prompts.configShown(false))).to.be.empty;
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
