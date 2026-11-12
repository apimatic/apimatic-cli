import { Buffer } from 'node:buffer';
import { URLSearchParams } from 'node:url';
import { RequestModel } from '../../src/types/mock/matching/request-model.js';
import { percentEncode } from '../../src/types/mock/text/percent.js';

/** The reference's fixed test credentials and the identifiers its sample stubs follow across operations. */
export const ledger = {
  bearerToken: 'test-bearer-token',
  apiKey: 'test-api-key',
  basicHeader: 'Basic dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ=',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  clientCredentialsToken: 'cc-access-token',
  username: 'test-user',
  password: 'test-password', // NOSONAR - the mock's fixed test credential, never a real one
  passwordToken: 'pw-access-token',
  implicitToken: 'im-access-token',
  partnerClientId: 'partner-client-id',
  partnerClientSecret: 'partner-client-secret',
  partnerToken: 'partner-access-token',
  accountA: '7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d',
  accountB: '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e',
  documentD1: 'd0c5e1a2-6b7c-4d8e-9f01-a2b3c4d5e6f7',
  createAccountIdempotencyKey: '9b2f6c1e-7d3a-4e8b-a5c4-1f0e9d8c7b6a',
  sessionCookie: 'sess_7f3a',
  createAccountBody:
    '{"name":"Operating cash","class":"asset","owner_id":"c0ffee00-1234-4567-89ab-cdef01234567","credit_limit":"1250.75"}',
  createTransactionBody:
    '{"amount":"250.00","idempotency_key":"idem_8c1f","posted_at":"2026-03-01T10:00:00+01:00","memo":{"note":"anything"}}',
  documentMetadata: '{"title":"February statement","tags":["statement","2026-02"]}',
  statementPdf: Buffer.from('%PDF-1.7\n'),
  settleAccountForm: [
    ['note', 'Month end'],
    ['tags', 'rent'],
    ['tags', 'shared'],
    ['filter[since]', '2026-02-01'],
    ['settled_at', '2026-02-28T17:00:00Z']
  ] as [string, string][]
} as const;

/** A request as a client writes it: the target with its query percent-encoded, and whether the body goes out without its length. */
export interface WireRequest {
  readonly method: string;
  readonly target: string;
  readonly headers: readonly [string, string][];
  readonly body: Uint8Array;
  readonly chunked: boolean;
}

export interface SentPart {
  readonly name: string;
  readonly fileName?: string;
  readonly contentType?: string;
  readonly content: string | Uint8Array;
}

/** Builds a request the way a test reads best, and hands it over as the model the matcher sees. */
export class TestRequest {
  private readonly method: string;
  private readonly path: string;
  private readonly pairs: [string, string][] = [];
  private readonly headers: [string, string][] = [];
  private body: Uint8Array = new Uint8Array();
  private sentChunked = false;

  private constructor(method: string, path: string) {
    this.method = method;
    this.path = path;
  }

  public static get = (path: string) => new TestRequest('GET', path);
  public static post = (path: string) => new TestRequest('POST', path);
  public static put = (path: string) => new TestRequest('PUT', path);
  public static patch = (path: string) => new TestRequest('PATCH', path);
  public static delete = (path: string) => new TestRequest('DELETE', path);
  public static of = (method: string, path: string) => new TestRequest(method, path);

  public query(key: string, ...values: string[]): this {
    this.pairs.push(...values.map((value): [string, string] => [key, value]));
    return this;
  }

  public header(name: string, value: string): this {
    this.headers.push([name, value]);
    return this;
  }

  public bearer = (token: string = ledger.bearerToken) => this.header('Authorization', `Bearer ${token}`);
  public apiKey = (key: string = ledger.apiKey) => this.header('X-API-Key', key);
  public basic = () => this.header('Authorization', ledger.basicHeader);
  public cookie = (name: string, value: string) => this.header('Cookie', `${name}=${value}`);
  public prefer = (value: string) => this.header('Prefer', value);
  public json = (json: string) => this.bytes(Buffer.from(json, 'utf8'), 'application/json');
  public text = (text: string, contentType = 'text/plain') => this.bytes(Buffer.from(text, 'utf8'), contentType);

  public bytes(bytes: Uint8Array, contentType = 'application/octet-stream'): this {
    this.body = bytes;
    return this.header('Content-Type', contentType);
  }

  /** Encoded as a browser or an SDK encodes a form: `+` for a space, brackets escaped. */
  public form(...fields: (readonly [string, string])[]): this {
    return this.text(
      new URLSearchParams(fields.map(([name, value]): [string, string] => [name, value])).toString(),
      'application/x-www-form-urlencoded'
    );
  }

  public multipart(parts: readonly SentPart[], boundary = 'test-boundary'): this {
    return this.bytes(multipartBody(parts, boundary), `multipart/form-data; boundary=${boundary}`);
  }

  /** The body sent without its length declared, as a client streaming it would. */
  public chunked(): this {
    this.sentChunked = true;
    return this;
  }

  public toWire(): WireRequest {
    const pairs = this.pairs.map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`);
    return {
      method: this.method,
      target: pairs.length === 0 ? this.path : `${this.path}?${pairs.join('&')}`,
      headers: this.headers,
      body: this.body,
      chunked: this.sentChunked
    };
  }

  public build(): RequestModel {
    return new RequestModel(this.method, this.path, this.pairs, this.headers, this.body);
  }
}

/** A multipart body as RFC 7578 writes it: quoted names, CRLF line ends, a closing delimiter. */
export function multipartBody(parts: readonly SentPart[], boundary: string): Uint8Array {
  const written = parts.flatMap((part) => {
    const fileName = part.fileName === undefined ? '' : `; filename="${part.fileName}"`;
    const contentType = part.contentType === undefined ? '' : `Content-Type: ${part.contentType}\r\n`;
    return [
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${fileName}\r\n${contentType}\r\n`
      ),
      typeof part.content === 'string' ? Buffer.from(part.content, 'utf8') : Buffer.from(part.content),
      Buffer.from('\r\n')
    ];
  });
  return Buffer.concat([...written, Buffer.from(`--${boundary}--\r\n`)]);
}

const pdf = (fileName: string, name = 'file'): SentPart => ({
  name,
  fileName,
  contentType: 'application/pdf',
  content: ledger.statementPdf
});

/** Requests that the sample stub set answers, one per stub the matcher tests lean on. */
export const sampleRequests = {
  listAccountsPage2(authenticated = true): TestRequest {
    const request = TestRequest.get('/v1/accounts')
      .query('offset', '1')
      .query('tags', 'rent', 'shared')
      .query('cursor', 'cur_7f3a')
      .header('Accept', 'application/json');
    return authenticated ? request.bearer() : request;
  },

  createAccount(options: { body?: string; idempotencyKey?: string; sessionCookie?: string } = {}): TestRequest {
    return TestRequest.post('/v1/accounts')
      .header('Idempotency-Key', options.idempotencyKey ?? ledger.createAccountIdempotencyKey)
      .cookie('ledger_session', options.sessionCookie ?? ledger.sessionCookie)
      .bearer(ledger.clientCredentialsToken)
      .json(options.body ?? ledger.createAccountBody);
  },

  settleAccount(...fields: (readonly [string, string])[]): TestRequest {
    return TestRequest.post(`/v1/accounts/${ledger.accountA}/settle`)
      .bearer()
      .form(...(fields.length === 0 ? ledger.settleAccountForm : fields));
  },

  uploadDocument(fileName = 'statement-2026-02.pdf', description = 'Monthly statement for February 2026'): TestRequest {
    return TestRequest.post('/v1/documents')
      .bearer()
      .multipart([
        pdf(fileName),
        { name: 'metadata', contentType: 'application/json; charset=utf-8', content: ledger.documentMetadata },
        { name: 'description', contentType: 'text/plain; charset=utf-8', content: description }
      ]);
  },

  uploadStatements(...fileNames: string[]): TestRequest {
    return TestRequest.post(`/v1/accounts/${ledger.accountA}/statements`)
      .bearer()
      .multipart([
        ...fileNames.map((fileName) => pdf(fileName, 'files')),
        { name: 'note', contentType: 'text/plain; charset=utf-8', content: 'January and February' }
      ]);
  },

  listTransactions(): TestRequest {
    return TestRequest.get(`/v1/accounts/${ledger.accountA}/transactions`)
      .header('Accept', 'application/json')
      .bearer();
  },

  createTransaction(body: string = ledger.createTransactionBody): TestRequest {
    return TestRequest.post(`/v1/accounts/${ledger.accountA}/transactions`)
      .header('X-Request-Time', '2026-03-01T09:00:00Z')
      .bearer()
      .json(body);
  }
};
