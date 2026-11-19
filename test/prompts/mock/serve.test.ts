import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { fixedPlace, FREE_PORT } from '../../../src/infrastructure/mock/listen.js';
import { MockServePrompts } from '../../../src/prompts/mock/serve.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { LoggedRequest, loggedRequest } from '../../../src/types/mock/routing/request-log.js';
import { StubRouter } from '../../../src/types/mock/routing/stub-router.js';
import { TestRequest } from '../../helpers/mock-requests.js';
import { oauth2Stub, stubsOf, successStub } from '../../helpers/mock-stubs.js';

/** What `say` writes to a stream, without colours, with clack's gutter removed from each line. */
function written(stream: NodeJS.WriteStream, say: () => void): string[] {
  const write = sinon.stub(stream, 'write').returns(true);
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

describe('MockServePrompts', () => {
  const prompts = new MockServePrompts();
  const stubs = new DirectoryPath('stubs');

  describe('once the mock listens', () => {
    const lines = () => written(process.stdout, () => prompts.mockServed('http://localhost:4010', stubs, 20));

    it('prints the marker and the origin on a line of their own, for a harness to read', () => {
      expect(lines()[0]).to.equal('MOCKSERVER_URL=http://localhost:4010');
    });

    it('says where the mock runs, what it serves, where its request log is and how to stop it', () => {
      expect(lines().slice(1)).to.deep.equal([
        `The mock is running at http://localhost:4010, serving 20 stub(s) from '${stubs}'.`,
        'A request no stub describes is answered 418 with the difference from the closest stub.',
        'The requests it received are listed at http://localhost:4010/__admin/requests.',
        'Press CTRL+C to stop the server.'
      ]);
    });
  });

  describe('stub problems', () => {
    it('lists them by file, each with its stub and pointer, under their count', () => {
      const lines = written(process.stdout, () =>
        prompts.stubProblems(
          [
            { file: 'a.json', path: '', message: 'Not valid JSON.' },
            { file: 'b.json', stub: 'listAccounts 200', path: '/0/response/status', message: 'Must be 200 to 599.' },
            { file: 'b.json', path: '/1/name', message: 'Missing.' }
          ],
          stubs
        )
      );

      expect(lines).to.deep.equal([
        `3 problem(s) in the stubs of '${stubs}'; the mock was not started.`,
        "'a.json'",
        '  Not valid JSON.',
        "'b.json'",
        '  [listAccounts 200] /0/response/status: Must be 200 to 599.',
        '  /1/name: Missing.'
      ]);
    });

    it('does not repeat the directory for a problem of the directory itself', () => {
      const lines = written(process.stdout, () =>
        prompts.stubProblems(
          [{ file: stubs.toString(), path: '', message: 'The stubs directory does not exist.' }],
          stubs
        )
      );

      expect(lines).to.deep.equal([
        `1 problem(s) in the stubs of '${stubs}'; the mock was not started.`,
        'The stubs directory does not exist.'
      ]);
    });
  });

  describe('a port it could not open', () => {
    for (const [what, where, named] of [
      ['a fixed origin', fixedPlace('localhost', 4010), 'http://localhost:4010'],
      ['a free port', FREE_PORT, 'a free port on localhost']
    ] as const) {
      it(`names ${what}, the reason and the flag that chooses another port`, () => {
        const lines = written(process.stdout, () => prompts.notListening(where, 'the port is already in use'));

        expect(lines).to.deep.equal([
          `The mock could not start on ${named}: the port is already in use.`,
          'Pass another --port, or --port=0 for a free one.'
        ]);
      });
    }
  });

  describe('a request, when verbose', () => {
    const router = new StubRouter(stubsOf({ 'a.json': successStub({ name: 'the stub' }), 'b.json': oauth2Stub() }));
    const logged = (request: TestRequest): LoggedRequest => {
      const model = request.build();
      return loggedRequest(model, router.decide(model));
    };
    const token = TestRequest.post('/oauth2/token').form(
      ['grant_type', 'client_credentials'],
      ['client_id', 'c'],
      ['client_secret', 's']
    );

    for (const [what, request, line] of [
      ['the stub that answered', TestRequest.get('/v1/x'), 'GET /v1/x -> 200 the stub'],
      [
        'the summary of a miss',
        TestRequest.get('/v1/y').query('q', '1'),
        "GET /v1/y?q=1 -> 418 closest 'the stub': path: expected /v1/x, got /v1/y; " +
          'query q: expected absent (not a parameter of this stub), got 1'
      ],
      ['the OAuth2 server for an answer of its own', token, 'POST /oauth2/token -> 200 OAuth2 server']
    ] as const) {
      it(`is written on one line with its status and ${what}`, () => {
        const lines = written(process.stderr, () => prompts.requestServed(logged(request)));

        expect(lines).to.deep.equal([line]);
      });
    }

    it('goes to stderr, so stdout carries only what a harness reads', () => {
      const lines = written(process.stdout, () =>
        written(process.stderr, () => prompts.requestServed(logged(TestRequest.get('/v1/x'))))
      );

      expect(lines).to.deep.equal([]);
    });
  });
});
