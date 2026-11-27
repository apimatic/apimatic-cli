import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { MockGeneratePrompts } from '../../../src/prompts/mock/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { StubProblem } from '../../../src/types/mock/stub-format/stub-problem.js';

/** What `say` writes to stdout, without colours, with clack's gutter removed from each line. */
function written(say: () => void): string[] {
  const write = sinon.stub(process.stdout, 'write').returns(true);
  try {
    say();
  } finally {
    write.restore();
  }
  return stripVTControlCharacters(write.args.map(([chunk]) => String(chunk)).join(''))
    .split('\n')
    .map((line) => line.slice(3))
    .filter((line) => line.length > 0);
}

describe('MockGeneratePrompts', () => {
  const prompts = new MockGeneratePrompts();
  const stubs = new DirectoryPath('stubs');
  const source = new DirectoryPath('src');

  describe('once the stub files are written', () => {
    it('says how many stubs the directory holds, then the command that serves them', () => {
      const lines = written(() => prompts.stubsGenerated(stubs, 84));

      expect(lines).to.deep.equal([
        "The stubs directory './stubs' now holds 84 stubs.",
        `Run 'apimatic mock serve --stubs "./stubs"' to serve them.`
      ]);
    });

    it('names a stubs directory outside the working directory by its full path, quoted for any shell', () => {
      const elsewhere = new DirectoryPath(path.resolve('..', 'acme sdk', 'mock', 'stubs'));

      const lines = written(() => prompts.stubsGenerated(elsewhere, 1));

      expect(lines[1]).to.equal(`Run 'apimatic mock serve --stubs "${elsewhere}"' to serve them.`);
    });
  });

  describe('stub files mock serve would refuse', () => {
    const download = new DirectoryPath('downloaded');
    const problems: StubProblem[] = [
      {
        file: '02-getAccount.json',
        stub: 'getAccount 200',
        path: '/0/response/status',
        message: 'Expected 200 to 599.'
      },
      { file: '02-getAccount.json', path: '', message: 'The file is empty; a stub file holds an array of stubs.' },
      {
        file: '07-listCards.json',
        stub: 'listCards 200',
        path: '/0/name',
        message: "Another stub is named 'listCards 200'."
      }
    ];

    it('are counted, with what became of the stubs directory', () => {
      const lines = written(() => prompts.stubProblems(problems, download, stubs));

      expect(lines.slice(0, 1)).to.deep.equal([
        "3 problems in the generated stub files, which 'apimatic mock serve' would refuse. " +
          "The stubs directory './stubs' was left as it was."
      ]);
    });

    it('are listed under the file each is in, with its stub and where in the file', () => {
      const lines = written(() => prompts.stubProblems(problems, download, stubs));

      expect(lines.slice(1)).to.deep.equal([
        "'02-getAccount.json'",
        '  [getAccount 200] /0/response/status: Expected 200 to 599.',
        '  The file is empty; a stub file holds an array of stubs.',
        "'07-listCards.json'",
        "  [listCards 200] /0/name: Another stub is named 'listCards 200'."
      ]);
    });

    it('do not name the temporary folder a problem of the whole download is filed under', () => {
      const missing = [{ file: download.toString(), path: '', message: 'The stubs directory does not exist.' }];

      const lines = written(() => prompts.stubProblems(missing, download, stubs));

      expect(lines.slice(1)).to.deep.equal(['The stubs directory does not exist.']);
    });
  });

  describe('a run that wrote nothing', () => {
    it('says a destination holding the source would be emptied, and names one that would not', () => {
      const project = new DirectoryPath('.');

      const lines = written(() => prompts.destinationContainsSource(source, project));

      expect(lines.join(' ')).to.equal(
        `The destination '${project}' contains your source directory '${source}', and everything in the ` +
          'destination is replaced by the stub files. Choose a destination outside it, such as --destination=./stubs.'
      );
    });

    it('says an API specification without a stub leaves nothing to serve', () => {
      const lines = written(() => prompts.noStubsGenerated(stubs));

      expect(lines).to.deep.equal([
        'No stub was generated for this API specification, so there is nothing to serve. ' +
          "The stubs directory './stubs' was left as it was."
      ]);
    });

    it('says what a bad response says, then why the download could not be unzipped', () => {
      const lines = written(() =>
        prompts.downloadNotUnzipped({ kind: 'unzipFailed', reason: 'Invalid or unsupported zip format.' })
      );

      expect(lines).to.deep.equal([
        stripVTControlCharacters(ServiceError.InvalidResponse.errorMessage),
        'Invalid or unsupported zip format.'
      ]);
    });

    it('passes on what the service said, as plugin generate does', () => {
      const lines = written(() =>
        prompts.stubsNotGenerated(ServiceError.timeout('Stub generation timed out after 30 minutes.'))
      );

      expect(lines).to.deep.equal(['Stub generation timed out after 30 minutes.']);
    });
  });
});
