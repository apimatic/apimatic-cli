import { Buffer } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import { expect } from 'chai';
import { writeJson } from '../../../src/types/mock/json/json-writer.js';
import { parseMultipartForm } from '../../../src/types/mock/matching/multipart-form.js';
import { renderSseEvent } from '../../../src/types/mock/stub-format/stub-response.js';
import { jsonDifferences, mockOver, tempMocks } from '../../helpers/mock-http.js';
import { ledger, sampleRequests, TestRequest } from '../../helpers/mock-requests.js';
import { sampleSuccess, successStub } from '../../helpers/mock-stubs.js';

const account = `/v1/accounts/${ledger.accountA}`;
const document = `/v1/documents/${ledger.documentD1}`;

describe('the mock over HTTP, on the sample stubs', () => {
  const mock = mockOver('sample');
  const temp = tempMocks();

  const events = () => TestRequest.get(`${account}/events`).header('Accept', 'text/event-stream').bearer();
  const filteredAccounts = (query: string) =>
    TestRequest.get(`/v1/accounts?${query}`).header('Accept', 'application/json').bearer();

  describe('a request a stub describes', () => {
    it('serves the example of the stub that matches exactly', async () => {
      const { body } = sampleSuccess('listAccounts 200 page 2').response;
      const example = body.kind === 'json' ? writeJson(body.json) : '';

      const response = await mock().send(sampleRequests.listAccountsPage2());

      expect([
        response.status,
        response.header('Content-Type'),
        jsonDifferences(example, response.text())
      ]).to.deep.equal([200, 'application/json', []]);
    });

    it('serves the declared error a Prefer header asks for by its code', async () => {
      const response = await mock().send(TestRequest.get(account).bearer().prefer('code=404'));

      expect([response.status, response.json().code]).to.deep.equal([404, 'not_found']);
    });

    it('serves the stub of the example a Prefer header names', async () => {
      const response = await mock().send(sampleRequests.listTransactions().prefer('example=noItems'));

      expect([response.status, response.json().data]).to.deep.equal([200, []]);
    });

    it('serves the success stub to a Prefer header that asks for its own status', async () => {
      const response = await mock().send(sampleRequests.listTransactions().prefer('code=200'));

      expect([response.status, response.json().has_more]).to.deep.equal([200, true]);
    });

    it('answers 204 without a body', async () => {
      const response = await mock().send(TestRequest.delete(account).bearer());

      expect([response.status, response.text()]).to.deep.equal([204, '']);
    });

    it('matches a date-time sent in another spelling of the same instant', async () => {
      const response = await mock().send(sampleRequests.createTransaction());

      expect(response.status).to.equal(201);
    });

    for (const [what, request] of [
      ['a form body', () => sampleRequests.settleAccount()],
      ['the parts of a multipart body', () => sampleRequests.uploadDocument()],
      [
        'two files under one part name',
        () => sampleRequests.uploadStatements('statement-2026-01.pdf', 'statement-2026-02.pdf')
      ],
      [
        'the exact bytes of a binary body',
        () => TestRequest.put(`${document}/content`).bearer().bytes(ledger.statementPdf)
      ]
    ] as const) {
      it(`matches ${what}`, async () => {
        const response = await mock().send(request());

        expect(response.status).to.be.oneOf([200, 201]);
      });
    }
  });

  describe('the query string', () => {
    for (const [what, query] of [
      ['percent-encoded brackets and a space sent as %20', 'filter%5Bstatus%5D=active&q=cash%20flow'],
      ['a space sent as +, as most SDK languages send it', 'filter%5Bstatus%5D=active&q=cash+flow']
    ]) {
      it(`is decoded before matching: ${what}`, async () => {
        const response = await mock().send(filteredAccounts(query));

        expect([response.status, response.json().total_count]).to.deep.equal([200, 1]);
      });
    }

    it('keeps an encoded plus a plus, so the 418 names the key', async () => {
      const response = await mock().send(filteredAccounts('filter%5Bstatus%5D=active&q=cash%2Bflow'));

      expect(response.expectMismatch().map(({ name, actual }) => [name, actual])).to.deep.equal([['q', 'cash+flow']]);
    });

    it('refuses a key the stub does not name, and the 418 names the closest stub', async () => {
      const response = await mock().send(sampleRequests.listAccountsPage2().query('verbose', 'true'));

      expect([
        response.status,
        response.header('Content-Type'),
        response.header('X-Mock-Mismatch').startsWith("closest 'listAccounts 200 page 2'"),
        response.json().closest_stub,
        response.json().differences.map((difference: { name: string }) => difference.name)
      ]).to.deep.equal([418, 'application/problem+json', true, 'listAccounts 200 page 2', ['verbose']]);
    });

    it('shows a value outside ASCII as sent in the report and escaped in the header', async () => {
      const request = TestRequest.get('/v1/accounts').query('q', '€').header('Accept', 'application/json').bearer();

      const response = await mock().send(request);

      expect([
        response.expectMismatch().map(({ name, actual }) => [name, actual]),
        response.header('X-Mock-Mismatch').endsWith('got \\u20AC')
      ]).to.deep.equal([[['q', '€']], true]);
    });

    it('decodes the path once and the query once, and quotes both with their % escaped again', async () => {
      const response = await mock().send(TestRequest.get('/v1/x%252541').query('q', '%41'));

      expect(response.expectJson(418).request).to.equal('GET /v1/x%252541?q=%2541');
    });
  });

  describe('the body', () => {
    it('refuses JSON with a duplicate key, which a lenient reader would match', async () => {
      const body = `${ledger.createAccountBody.slice(0, -1)},"name":"Operating cash"}`;

      const response = await mock().send(sampleRequests.createAccount({ body }));

      const [difference, ...others] = response.expectMismatch();
      expect([
        difference.name,
        difference.actual.startsWith("not JSON: Duplicate property 'name'"),
        others
      ]).to.deep.equal(['', true, []]);
    });

    it('cuts the header at its limit and keeps every difference in the report', async () => {
      const extras = Array.from(
        { length: 20 },
        (_, index) => `"extra_${String(index).padStart(2, '0')}":"${'x'.repeat(100)}"`
      );
      const body = `${ledger.createAccountBody.slice(0, -1)},${extras.join(',')}}`;

      const response = await mock().send(sampleRequests.createAccount({ body }));

      const header = response.header('X-Mock-Mismatch');
      expect([response.expectMismatch().length, header.length, header.endsWith('...')]).to.deep.equal([20, 1003, true]);
    });

    it('names a form field the stub does not expect', async () => {
      const request = sampleRequests.settleAccount(...ledger.settleAccountForm, ['extra', '1']);

      const response = await mock().send(request);

      expect(response.expectMismatch().map(({ where, name }) => [where, name])).to.deep.equal([['form', 'extra']]);
    });

    for (const [what, request] of [
      ['a DELETE', () => TestRequest.delete(account).bearer().json('{}')],
      ['a GET', () => sampleRequests.listAccountsPage2().json('{}')]
    ] as const) {
      it(`is read on ${what}, so one the stub does not expect answers 418`, async () => {
        const response = await mock().send(request());

        expect(response.expectMismatch().map(({ where }) => where)).to.deep.equal(['body']);
      });
    }

    it('is compared as sent, so a gzipped upload does not pass a stub of the plain bytes', async () => {
      const request = TestRequest.put(`${document}/content`)
        .bearer()
        .bytes(gzipSync(ledger.statementPdf))
        .header('Content-Encoding', 'gzip');

      const response = await mock().send(request);

      expect(response.expectMismatch().map(({ where }) => where)).to.deep.equal(['body']);
    });

    for (const encoding of ['gzip', 'deflate']) {
      it(`is never inflated, so plain bytes labelled ${encoding} match as sent`, async () => {
        const request = TestRequest.put(`${document}/content`)
          .bearer()
          .bytes(ledger.statementPdf)
          .header('Content-Encoding', encoding);

        const response = await mock().send(request);

        expect(response.status).to.equal(200);
      });
    }
  });

  describe('the Prefer header', () => {
    it('answers 418 naming the example to one the operation does not have', async () => {
      const response = await mock().send(sampleRequests.listTransactions().prefer('example=nope'));

      expect(response.expectMismatch().map(({ expected, actual }) => [expected, actual])).to.deep.equal([
        ['example=firstPage', 'example=nope']
      ]);
    });
  });

  describe('a header', () => {
    it('sent as UTF-8 is read as UTF-8, so the report quotes what the client wrote', async () => {
      const stubs = await temp.start({ 'a.json': successStub({ headers: '"X-Name": "cafe"' }) });

      const answer = await stubs.sendRaw('GET', '/v1/x', 'X-Name: café');

      expect(answer).to.include('"actual": "café"');
    });

    it('sent twice is seen twice', async () => {
      const stubs = await temp.start({ 'a.json': successStub({ headers: '"X-Name": "one"' }) });

      const answer = await stubs.sendRaw('GET', '/v1/x', 'X-Name: one', 'x-name: two');

      expect(answer).to.include('"actual": "one & two"');
    });
  });

  describe('a response body', () => {
    it('streams the events of an SSE stub as rendered', async () => {
      const { body } = sampleSuccess('streamAccountEvents 200 live').response;
      const rendered = body.kind === 'sse' ? body.events.map(renderSseEvent).join('') : '';

      const response = await mock().send(events());

      expect([
        response.status,
        response.header('Content-Type'),
        response.header('Cache-Control'),
        response.text()
      ]).to.deep.equal([200, 'text/event-stream', 'no-cache', rendered]);
    });

    it('streams complete again to a second request', async () => {
      await mock().send(events());

      const second = await mock().send(events());

      expect(second.text().endsWith('data: [DONE]\n\n')).to.equal(true);
    });

    it('streams one document per line from an ndjson stub', async () => {
      const request = TestRequest.get(`${account}/transactions/export`)
        .header('Accept', 'application/x-ndjson')
        .bearer();

      const response = await mock().send(request);

      expect([response.header('Content-Type'), response.text()]).to.deep.equal([
        'application/x-ndjson',
        '{"id":"t1","amount":"250.00"}\n{"id":"t2","amount":"75.50"}\n'
      ]);
    });

    it('serves the bytes of a binary stub with the headers it states', async () => {
      const request = TestRequest.get(`${document}/content`).header('Accept', 'application/octet-stream').bearer();

      const response = await mock().send(request);

      expect([
        response.header('Content-Type'),
        response.header('Content-Disposition'),
        response.body.equals(ledger.statementPdf)
      ]).to.deep.equal(['application/pdf', 'attachment; filename="statement-2026-02.pdf"', true]);
    });

    it('serves the parts of a multipart stub so that a multipart reader reads them', async () => {
      const request = TestRequest.get(`${document}/bundle`).header('Accept', 'multipart/form-data').bearer();

      const response = await mock().send(request);

      const form = parseMultipartForm(response.header('Content-Type'), response.body);
      const parts = form.kind === 'parts' ? [...form.byName.values()].flat() : [];
      expect([
        response.status,
        response.header('Content-Type'),
        response.text().startsWith('--mockserver-boundary\r\nContent-Disposition: form-data; name="metadata"\r\n'),
        parts.map((part) => [part.name, part.fileName, part.contentType]),
        parts.map((part) => Buffer.from(part.content).toString('utf8'))
      ]).to.deep.equal([
        200,
        'multipart/form-data; boundary=mockserver-boundary',
        true,
        [
          ['file', ['statement-2026-02.pdf'], ['application/pdf']],
          ['metadata', [], ['application/json']]
        ],
        [
          ledger.statementPdf.toString('utf8'),
          `{"id":"${ledger.documentD1}","title":"February statement","content_type":"application/pdf"}`
        ]
      ]);
    });
  });

  describe('{{origin}} in a response header', () => {
    it('is the origin the mock listens on for a request sent there', async () => {
      const response = await mock().send(sampleRequests.createAccount());

      expect([response.status, response.header('Location')]).to.deep.equal([
        201,
        `${mock().url}/v1/accounts/${ledger.accountA}`
      ]);
    });

    for (const [what, host, origin] of [
      ["the request's own origin, not the one listened on", 'mock.example:9000', 'http://mock.example:9000'],
      ['written without a port for a request that names none', 'mock.example', 'http://mock.example']
    ]) {
      it(`is ${what}`, async () => {
        const response = await mock().send(sampleRequests.createAccount().header('Host', host));

        expect(response.header('Location')).to.equal(`${origin}/v1/accounts/${ledger.accountA}`);
      });
    }
  });
});
