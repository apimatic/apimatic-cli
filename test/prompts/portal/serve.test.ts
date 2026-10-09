import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { PortalServePrompts } from '../../../src/prompts/portal/serve.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { UrlPath } from '../../../src/types/file/urlPath.js';
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
        /Restart the preview after adding a language or a 'plugin' block \(its SDK or plugin is fetched at startup\), adding or removing a page, creating '.*static', changing which documents are in '.*spec', or changing the path in 'portal\.site\.url'\./
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
  it('says a refused specification leaves what it cannot read out of the reference, and would stop a build', () => {
    const problem: PortalSourceProblem = { kind: 'emptySpecDirectory', folders: [] };

    expect(lastLine('message', (prompts) => prompts.specRejected(problem, new DirectoryPath('src')))).to.match(
      /^The preview leaves what it cannot read out of the API reference until '.*spec' is fixed; a build would stop here\.$/
    );
  });

  describe('a watch that cannot start, or stops', () => {
    const source = new DirectoryPath('src');
    const cases: [string, (prompts: PortalServePrompts) => void, RegExp][] = [
      [
        'apimatic.json, at the start',
        (prompts) => prompts.configNotWatched('EMFILE'),
        /^'apimatic\.json' cannot be watched \(EMFILE\), so edits to it need the preview restarted\.$/
      ],
      [
        'apimatic.json, while serving',
        (prompts) => prompts.configWatchFailed('EPERM'),
        /^'apimatic\.json' is no longer watched \(EPERM\), so further edits to it need the preview restarted\.$/
      ],
      [
        'the content, at the start',
        (prompts) => prompts.contentNotWatched('EMFILE', source),
        /^'.*content' cannot be watched \(EMFILE\), so a mistake in a page or a 'nav\.json' is only reported when the preview is restarted\.$/
      ],
      [
        'the content, while serving',
        (prompts) => prompts.contentWatchFailed('EPERM', source),
        /^'.*content' is no longer watched \(EPERM\), so a mistake in a page or a 'nav\.json' is only reported when the preview is restarted\.$/
      ],
      [
        'the specifications, at the start',
        (prompts) => prompts.specNotWatched('EMFILE', source),
        /^'.*spec' cannot be watched \(EMFILE\), so a mistake in a specification is only reported when the preview is restarted\.$/
      ],
      [
        'the specifications, while serving',
        (prompts) => prompts.specWatchFailed('EPERM', source),
        /^'.*spec' is no longer watched \(EPERM\), so a mistake in a specification is only reported when the preview is restarted\.$/
      ]
    ];

    cases.forEach(([label, say, expected]) => {
      it(`says what is no longer reported on save for ${label}`, () => {
        expect(lastLine('warn', say)).to.match(expected);
      });
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

    it('names each document added and removed, and that a restart matches them', () => {
      const [warning, advice] = said(['orders.json'], ['pets.json']);

      expect(warning).to.match(
        /^The documents in '.*spec' are not the ones the preview started with: 'orders\.json' was added, and 'pets\.json' was removed\.$/
      );
      expect(advice).to.equal(
        'Restart the preview to match them; until then it shows the ones it started with that are still there.'
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
