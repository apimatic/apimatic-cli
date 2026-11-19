import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { expect } from 'chai';
import { mockOver, placesOf } from '../../helpers/mock-http.js';
import { SentPart, TestRequest } from '../../helpers/mock-requests.js';
import { specS } from '../../helpers/mock-spec-s.js';

const account = `/v1/accounts/${specS.accountA}`;
const content = `/v1/documents/${specS.documentD1}/content`;
const render = `/v1/statements/${specS.statementS1}/render`;

const typesOf = (events: string[]): string[] => events.map((data) => JSON.parse(data).type);

describe('the Spec S streams, documents and request log over HTTP', () => {
  const mock = mockOver('spec-s');

  describe('server-sent events', () => {
    const events = () => TestRequest.get(`${account}/events`).bearer();

    it('ends the live stream with a typed done event, an int64 beyond 2^53 kept as written', async () => {
      const response = await mock().send(events());

      const data = response.sseData();
      expect([
        response.expect(200).length > 0,
        response.header('Content-Type'),
        typesOf(data),
        data[0].includes('"sequence":9007199254740993')
      ]).to.deep.equal([true, 'text/event-stream', ['transaction.posted', 'balance.updated', 'done'], true]);
    });

    it('resumes from an exact int64, the stream carrying an event type the spec does not list', async () => {
      const response = await mock().send(events().query('since_sequence', '9007199254740993'));

      expect(typesOf(response.sseData())).to.deep.equal([
        'transaction.posted',
        'statement.ready',
        'balance.updated',
        'done'
      ]);
    });

    it('answers 418 against the resume stub to an int64 an SDK rounded, showing the digit it lost', async () => {
      const response = await mock().send(events().query('since_sequence', '9007199254740992'));

      expect([
        response.expectMismatch(),
        response.header('X-Mock-Mismatch').startsWith("closest 'streamAccountEvents 200 resume': ")
      ]).to.deep.equal([
        [{ where: 'query', name: 'since_sequence', expected: '9007199254740993', actual: '9007199254740992' }],
        true
      ]);
    });

    it('repeats the first stream to a second request', async () => {
      const first = (await mock().send(events())).sseData();

      const second = (await mock().send(events())).sseData();

      expect(second).to.deep.equal(first);
    });

    it('flushes the live stream event by event, which a buffered body would not', async () => {
      const response = await mock().send(events());

      expect([response.text().startsWith('id: 1\n'), response.spreadMs >= 25]).to.deep.equal([true, true]);
    });

    it('ends a rendered statement with the done sentinel', async () => {
      const response = await mock().send(TestRequest.post(render).apiKey().json(specS.renderOptionsBody));

      const frames = response.sseData();
      expect([
        frames[0].includes('01/02/2026 to 28/02/2026'),
        JSON.parse(frames[frames.length - 2]).finished,
        frames[frames.length - 1]
      ]).to.deep.equal([true, true, '[DONE]']);
    });

    it('renders with the defaults when the request has no body', async () => {
      const response = await mock().send(TestRequest.post(render).apiKey());

      const frames = response.sseData();
      expect([frames[1].includes('Rent split'), frames[frames.length - 1]]).to.deep.equal([true, '[DONE]']);
    });

    it('answers 418 to render options no stub describes', async () => {
      const request = TestRequest.post(render).apiKey().json('{"locale":"en-US","include_memos":false}');

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include('body /locale');
    });
  });

  describe('ndjson', () => {
    it('streams one JSON object per line', async () => {
      const request = TestRequest.get('/v1/transaction-exports')
        .query('since', '2026-03-01T00:00:00Z')
        .query('import', 'true')
        .bearer();

      const response = await mock().send(request);

      const lines = response
        .expect(200)
        .split('\n')
        .filter((line) => line.length > 0);
      expect([response.header('Content-Type'), lines.map((line) => JSON.parse(line).object)]).to.deep.equal([
        'application/x-ndjson',
        ['transaction', 'transaction']
      ]);
    });
  });

  describe('documents', () => {
    /** The spec's DocumentUpload: a PDF file part, a metadata part with its own encoding, and a plain description field. */
    const upload = (file: Uint8Array, metadataType: string): SentPart[] => [
      { name: 'file', fileName: specS.uploadFileName, contentType: 'application/pdf', content: file },
      { name: 'metadata', contentType: metadataType, content: specS.uploadMetadata },
      { name: 'description', contentType: 'text/plain; charset=utf-8', content: specS.uploadDescription }
    ];
    const uploadDocument = (file: Uint8Array, metadataType = 'application/json') =>
      TestRequest.post('/v1/documents').bearer().multipart(upload(file, metadataType));

    it('accepts an upload of a file, a JSON part and a text part', async () => {
      const response = await mock().send(uploadDocument(specS.statementPdf));

      const { size_bytes, sha256 } = response.expectJson(201);
      expect([size_bytes, sha256]).to.deep.equal([
        specS.statementPdf.length,
        createHash('sha256').update(specS.statementPdf).digest('base64')
      ]);
    });

    it('answers 418 to a metadata part that is not labelled JSON', async () => {
      const response = await mock().send(uploadDocument(specS.statementPdf, 'text/plain'));

      expect(placesOf(response.expectMismatch())).to.include('part metadata Content-Type');
    });

    it('answers 418 to other bytes in the file part', async () => {
      const response = await mock().send(uploadDocument(specS.statementPdfCorrected));

      expect(placesOf(response.expectMismatch())).to.include('part file');
    });

    it('serves the raw bytes of a document to Accept: application/octet-stream', async () => {
      const response = await mock().send(
        TestRequest.get(content).bearer().header('Accept', 'application/octet-stream')
      );

      expect([
        response.status,
        response.body.equals(specS.statementPdf),
        response.header('Content-Disposition')
      ]).to.deep.equal([200, true, 'attachment; filename="statement-2026-02.pdf"']);
    });

    it('serves the same document in a base64 envelope to Accept: application/json', async () => {
      const response = await mock().send(TestRequest.get(content).bearer().header('Accept', 'application/json'));

      expect(Buffer.from(response.expectJson(200).content, 'base64').equals(specS.statementPdf)).to.equal(true);
    });

    it('accepts the bytes it expects as the new content', async () => {
      const response = await mock().send(TestRequest.put(content).bearer().bytes(specS.statementPdfCorrected));

      expect(response.expectJson(200).size_bytes).to.equal(specS.statementPdfCorrected.length);
    });

    it('answers 418 naming the body to other bytes', async () => {
      const response = await mock().send(TestRequest.put(content).bearer().bytes(specS.statementPdf));

      expect(placesOf(response.expectMismatch())).to.include('body');
    });
  });

  describe('the request log', () => {
    it('lets a retry test count its attempts by a marker of its own, since the mock is stateless', async () => {
      const marker = randomUUID();
      for (let attempt = 0; attempt < 3; attempt++) {
        (await mock().send(TestRequest.get(account).bearer().prefer(`code=500, test-run=${marker}`))).expect(500);
      }

      const response = await mock().send(TestRequest.get('/__admin/requests'));

      const attempts = response
        .expectJson(200)
        .filter((entry: any) => (entry.request.headers.prefer ?? []).some((value: string) => value.includes(marker)));
      expect(attempts.map((entry: any) => entry.response.status)).to.deep.equal([500, 500, 500]);
    });
  });
});
