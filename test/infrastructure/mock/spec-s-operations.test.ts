import { expect } from 'chai';
import { Answered, jsonDifferences, mockOver, placesOf } from '../../helpers/mock-http.js';
import { authorizationCodeToken, clientCredentialsToken } from '../../helpers/mock-oauth2.js';
import { ledger, TestRequest } from '../../helpers/mock-requests.js';
import { MAX_PAGE_REQUESTS, specS, unfinishedWalk } from '../../helpers/mock-spec-s.js';

type Follow = (next: string, token: string) => TestRequest;

const SEARCH_CRITERIA =
  '"account_id":["7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d","0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e"],' +
  '"rules":[{"field":"amount","min":"50.00","max":"300.00"},{"field":"posted_at","after":"2026-02-01T00:00:00Z"},{"field":"memo","contains":"rent"}],' +
  '"limit":2';
const FIRST_AUDIT_PAGE: [string, string][] = [
  ['in', 'svc-ledger,avery'],
  ['limit', '2']
];

const account = (id: string = specS.accountA) => `/v1/accounts/${id}`;
const idsOf = (items: { id: string }[]): string[] => items.map((item) => item.id);

describe('the Spec S operations over HTTP', () => {
  const mock = mockOver('spec-s');

  describe('accounts', () => {
    /** What an offset paginator does: no offset first, then the number of items seen so far, until has_more is false. */
    const accountIdsByOffset = async (): Promise<string[]> => {
      const ids: string[] = [];
      let request = TestRequest.get('/v1/accounts').apiKey();
      for (let sent = 0; sent < MAX_PAGE_REQUESTS; sent++) {
        const page = (await mock().send(request)).expectJson(200);
        ids.push(...idsOf(page.data));
        if (!page.has_more) {
          return ids;
        }
        request = TestRequest.get('/v1/accounts').query('offset', String(ids.length)).apiKey();
      }
      throw unfinishedWalk(`offset ${ids.length}`);
    };

    const filtered = (...status: string[]) =>
      TestRequest.get('/v1/accounts')
        .query('limit', '10')
        .query('status', ...status)
        .query('class', 'asset')
        .bearer();

    it("serves the spec's example of the first page verbatim", async () => {
      const response = await mock().send(TestRequest.get('/v1/accounts').bearer());

      expect([
        jsonDifferences(specS.specExampleFirstPage, response.expect(200)),
        response.header('X-Request-Id')
      ]).to.deep.equal([[], 'req_list_accounts_p1']);
    });

    it('lets an offset paginator reach the end', async () => {
      const ids = await accountIdsByOffset();

      expect(ids).to.deep.equal([specS.accountA, specS.accountB]);
    });

    it('matches a status list sent as one comma-separated value', async () => {
      const response = await mock().send(filtered('active,frozen'));

      expect(response.expectJson(200).total_count).to.equal(1);
    });

    it('answers 418 to the same list exploded into repeated keys', async () => {
      const response = await mock().send(filtered('active', 'frozen'));

      expect(placesOf(response.expectMismatch())).to.include('query status');
    });

    it('answers an idempotent create with 201 and an absolute Location', async () => {
      const request = TestRequest.post('/v1/accounts')
        .bearer()
        .apiKey()
        .header('Idempotency-Key', specS.createAccountIdempotencyKey)
        .json(specS.createAccountBody);

      const response = await mock().send(request);

      expect([response.expectJson(201).id, response.header('Location')]).to.deep.equal([
        specS.accountC,
        `${mock().url}/v1/accounts/${specS.accountC}`
      ]);
    });

    it('returns every optional field of an account', async () => {
      const response = await mock().send(TestRequest.get(account()).bearer());

      const { credit_limit, legacy_code } = response.expectJson(200);
      expect([credit_limit, legacy_code]).to.deep.equal(['500.00', 'OPS-001']);
    });

    it('returns a null nickname to an update that sends explicit nulls', async () => {
      const request = TestRequest.patch(account())
        .bearer(await authorizationCodeToken(mock()))
        .json(specS.updateAccountBody);

      const response = await mock().send(request);

      const updated = response.expectJson(200);
      expect(['nickname' in updated, updated.nickname]).to.deep.equal([true, null]);
    });

    it('answers 418 to an update that omits a required nullable member', async () => {
      const request = TestRequest.patch(account())
        .bearer(await authorizationCodeToken(mock()))
        .json('{"name":"Operating cash (main)","credit_limit":null}');

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include('body /nickname');
    });

    it('deletes with an authorization code token, answering 204 without a body', async () => {
      const request = TestRequest.delete(account(specS.accountC)).bearer(await authorizationCodeToken(mock()));

      const response = await mock().send(request);

      expect(response.expect(204)).to.equal('');
    });

    for (const [credential, request] of [
      ['an API key in the query', () => TestRequest.get(`${account()}/balance`).query('api_key', ledger.apiKey)],
      ['basic credentials', () => TestRequest.get(`${account()}/balance`).basic()]
    ] as const) {
      it(`serves the balance as a bare JSON string to ${credential}`, async () => {
        const response = await mock().send(request());

        expect(response.expect(200)).to.equal('"1250.75"');
      });
    }

    it('still answers a deprecated operation', async () => {
      const response = await mock().send(TestRequest.get(`${account()}/summary`).apiKey());

      expect(response.expectJson(200).balance).to.equal('1250.75');
    });
  });

  describe('transactions', () => {
    const listTransactions = () =>
      TestRequest.get(`${account()}/transactions`)
        .query('limit', '2')
        .query('type', 'transfer')
        .query('tags', 'rent', 'shared')
        .query('filter[min_amount]', '10.00')
        .query('filter[since]', '2026-01-01')
        .bearer();

    const createTransaction = (token: string) =>
      TestRequest.post(`${account()}/transactions`)
        .bearer(token)
        .header('Idempotency-Key', specS.createTransactionIdempotencyKey)
        .json(specS.specExampleTransfer);

    /** Follows next_cursor until it is null; `next` builds the request that carries a cursor. */
    const transactionIdsByCursor = async (first: TestRequest, next: (cursor: string) => TestRequest) => {
      const ids: string[] = [];
      let request = first;
      let cursor = '';
      for (let sent = 0; sent < MAX_PAGE_REQUESTS; sent++) {
        const page = (await mock().send(request)).expectJson(200);
        ids.push(...idsOf(page.items));
        if (page.next_cursor === null || page.next_cursor === undefined) {
          return ids;
        }
        cursor = page.next_cursor;
        request = next(cursor);
      }
      throw unfinishedWalk(`cursor ${cursor}`);
    };

    it('lets a cursor paginator reach the end, every filter sent again with the cursor', async () => {
      const ids = await transactionIdsByCursor(listTransactions(), (cursor) =>
        listTransactions().query('cursor', cursor)
      );

      expect(ids).to.deep.equal([specS.transactionT1, specS.transactionT3, specS.transactionT4]);
    });

    it('lets a paginator whose cursor travels in the body reach the end', async () => {
      const search = (members: string) => TestRequest.post('/v1/transaction-searches').apiKey().json(`{${members}}`);

      const ids = await transactionIdsByCursor(search(SEARCH_CRITERIA), (cursor) =>
        search(`${SEARCH_CRITERIA},"cursor":"${cursor}"`)
      );

      expect(ids).to.deep.equal([specS.transactionT1, specS.transactionT3, specS.transactionT4]);
    });

    it('matches deepObject brackets sent as literal characters', async () => {
      const request = TestRequest.get(
        `${account()}/transactions?limit=2&type=transfer&tags=rent&tags=shared&filter[min_amount]=10.00&filter[since]=2026-01-01`
      ).bearer();

      const response = await mock().send(request);

      expect(response.status).to.equal(200);
    });

    it('keeps an int64 beyond 2^53 as written', async () => {
      const response = await mock().send(listTransactions());

      expect(response.expect(200)).to.include('"sequence":9007199254740993');
    });

    it("accepts the spec's example with a client credentials token", async () => {
      const response = await mock().send(createTransaction(await clientCredentialsToken(mock())));

      const { id, reference_id } = response.expectJson(201);
      expect([id, reference_id]).to.deep.equal([specS.transactionT1, specS.createTransactionIdempotencyKey]);
    });

    it('answers 418 to the static bearer token where the operation wants a client credentials token', async () => {
      const response = await mock().send(createTransaction(ledger.bearerToken));

      expect(placesOf(response.expectMismatch())).to.include('auth oauth2ClientCredentials');
    });

    it('returns every hazard of a transaction as written', async () => {
      const response = await mock().send(TestRequest.get(`/v1/transactions/${specS.transactionT2}`).bearer());

      const body = response.expect(200);
      const transaction = JSON.parse(body);
      expect([
        body.includes('"posted_at":"2026-02-20T12:34:56+01:00"'),
        body.includes('"sequence":9007199254740997'),
        transaction.details['card-brand'],
        transaction.details.three_d_secure.version,
        transaction.category.children[0].name,
        'none' in transaction.metadata,
        transaction.metadata.none
      ]).to.deep.equal([true, true, 'visa', '2.2.0', 'Client meals', true, null]);
    });

    it('returns the recursive category tree', async () => {
      const response = await mock().send(TestRequest.get('/v1/categories').query('default', 'false').bearer());

      expect(response.expectJson(200)[0].children[1].children[0].name).to.equal('Electricity');
    });
  });

  describe('statements', () => {
    /** Page 1, 2, … with the same filters, until the page served says it is the last; the number is read from the answer. */
    const statementIdsByPageNumber = async (): Promise<string[]> => {
      const ids: string[] = [];
      for (let number = 1; number <= MAX_PAGE_REQUESTS; number++) {
        const request = TestRequest.get('/v1/statements')
          .query('page', String(number))
          .query('page_size', '2')
          .query('account_id', specS.accountA)
          .bearer();
        const page = (await mock().send(request)).expectJson(200);
        ids.push(...idsOf(page.statements));
        if (page.page === page.total_pages) {
          return ids;
        }
      }
      throw unfinishedWalk(`page ${MAX_PAGE_REQUESTS + 1}`);
    };

    it('lets a page-number paginator reach the last page', async () => {
      const ids = await statementIdsByPageNumber();

      expect(ids).to.deep.equal([specS.statementS1, specS.statementS2, specS.statementS3]);
    });
  });

  describe('system', () => {
    const firstPage = (query: readonly [string, string][], token: string) =>
      query
        .reduce((request, [key, value]) => request.query(key, value), TestRequest.get('/v1/audit-events'))
        .cookie('ledger_session', 'replica-2')
        .bearer(token);

    /** The URL of a `rel="next"` Link header; a link of another relation is no page to follow. */
    const nextLink = (link: string): string => {
      const [url, parameters] = [link.slice(0, link.indexOf(';')), link.slice(link.indexOf(';') + 1)];
      if (!url.startsWith('<') || !url.endsWith('>') || parameters.trim() !== 'rel="next"') {
        throw new Error(`Not a rel="next" Link header: ${link}`);
      }
      return url.slice(1, -1);
    };

    /** A client that requests the next link whole and sends no cookie. */
    const wholeLink: Follow = (next, token) => TestRequest.get(next.slice(mock().url.length)).bearer(token);

    /** A client that sends the first request again, cookie included, with the link's query set over its own. */
    const linkQueryOverFirstRequest: Follow = (next, token) => {
      const linkQuery = next
        .slice(next.indexOf('?') + 1)
        .split('&')
        .map((pair) => pair.split('='))
        .map(([key, value = '']): [string, string] => [decodeURIComponent(key), decodeURIComponent(value)]);
      const kept = FIRST_AUDIT_PAGE.filter(([key]) => !linkQuery.some(([linked]) => linked === key));
      return firstPage([...kept, ...linkQuery], token);
    };

    const auditEventIdsByLink = async (follow: Follow): Promise<string[]> => {
      const token = await authorizationCodeToken(mock());
      const ids: string[] = [];
      let request = firstPage(FIRST_AUDIT_PAGE, token);
      let next = '';
      for (let sent = 0; sent < MAX_PAGE_REQUESTS; sent++) {
        const response: Answered = await mock().send(request);
        ids.push(...idsOf(response.expectJson(200)));
        const link = response.header('Link');
        if (link.length === 0) {
          return ids;
        }
        next = nextLink(link);
        if (!next.startsWith(mock().url)) {
          throw new Error(`The next link ${next} does not start with the origin ${mock().url}.`);
        }
        request = follow(next, token);
      }
      throw unfinishedWalk(next);
    };

    for (const [client, follow] of [
      ['requests each next link whole', wholeLink],
      ["sets the link's query over its first request", linkQueryOverFirstRequest]
    ] as const) {
      it(`lets a Link-header paginator that ${client} reach the end`, async () => {
        const ids = await auditEventIdsByLink(follow);

        expect(ids).to.deep.equal([specS.auditEventE1, specS.auditEventE2, specS.auditEventE3]);
      });
    }

    it('answers 418 to the first page without its session cookie', async () => {
      const request = FIRST_AUDIT_PAGE.reduce(
        (built, [key, value]) => built.query(key, value),
        TestRequest.get('/v1/audit-events')
      ).bearer(await authorizationCodeToken(mock()));

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include('cookie ledger_session');
    });

    it('serves the health check from the root without credentials', async () => {
      const response = await mock().send(TestRequest.get('/health'));

      expect(response.expectJson(200).status).to.equal('ok');
    });

    it('leaves a write-only secret out of the response', async () => {
      const request = TestRequest.post('/v1/webhook-endpoints').bearer().json(specS.webhookEndpointBody);

      const response = await mock().send(request);

      const endpoint = response.expectJson(201);
      expect(['secret' in endpoint, endpoint.client.id]).to.deep.equal([false, 'cli_spec_s_tests']);
    });

    it('answers 418 to a read-only field sent in the request', async () => {
      const request = TestRequest.post('/v1/webhook-endpoints')
        .bearer()
        .json(`{"id":"b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",${specS.webhookEndpointBody.slice(1)}`);

      const response = await mock().send(request);

      expect(placesOf(response.expectMismatch())).to.include('body /id');
    });
  });
});
