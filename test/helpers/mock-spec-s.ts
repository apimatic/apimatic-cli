import { Buffer } from 'node:buffer';

/**
 * What a generated Spec S test is configured with in mock mode: the identifiers, bodies and bytes
 * the stubs use, written out here rather than read from the stubs, so the tests check the stubs.
 * The credentials are the fixed ones every stub set shares, in `ledger`.
 */
export const specS = {
  accountA: '7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d',
  accountB: '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e',
  accountC: '5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d0e',
  transactionT1: '9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c6b',
  transactionT2: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
  transactionT3: '4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d',
  transactionT4: '6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f',
  statementS1: '2b7c9e10-4d3a-4f6b-9c8d-7e6f5a4b3c21',
  statementS2: '3c8d0f21-5e4b-4a7c-8d9e-8f7a6b5c4d32',
  statementS3: '4d9e1a32-6f5c-4b8d-9eaf-9a8b7c6d5e43',
  documentD1: 'd0c5e1a2-6b7c-4d8e-9f01-a2b3c4d5e6f7',
  auditEventE1: 'e1a00001-0000-4000-8000-000000000001',
  auditEventE2: 'e1a00002-0000-4000-8000-000000000002',
  auditEventE3: 'e1a00003-0000-4000-8000-000000000003',

  createAccountIdempotencyKey: '9b2f6c1e-7d3a-4e8b-a5c4-1f0e9d8c7b6a',
  createTransactionIdempotencyKey: '4f9c2d1e-8b7a-4c6d-9e5f-0a1b2c3d4e5f',

  statementPdf: Buffer.from('%PDF-1.7\n% Spec S sample statement, February 2026\n%%EOF\n'),
  statementPdfCorrected: Buffer.from('%PDF-1.7\n% Spec S sample statement, February 2026 (corrected)\n%%EOF\n'),

  createAccountBody:
    '{"name":"Travel card","class":"liability","currency":"USD","owner_id":"c0ffee00-1234-4567-89ab-cdef01234567","profile":"premium","external_reference":"crm-4471"}',
  updateAccountBody: '{"name":"Operating cash (main)","nickname":null,"credit_limit":null}',
  renderOptionsBody: '{"locale":"en-GB","include_memos":false}',
  webhookEndpointBody:
    '{"url":"https://hooks.example.com/ledger","events":["transaction.posted","account.updated"],"secret":"whsec_9f8e7d6c5b4a39281706f5e4d3c2b1a0"}',
  uploadMetadata:
    '{"title":"February statement","account_id":"7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d","tags":["statement","2026-02"]}',
  uploadDescription: 'Monthly statement for February 2026',
  uploadFileName: 'statement-2026-02.pdf',

  /** The spec's listAccounts example firstPage, copied from openapi.yaml. */
  specExampleFirstPage: `{
    "data": [
      {
        "id": "7a1b9d2e-3c4f-4a5b-8c6d-9e0f1a2b3c4d",
        "name": "Operating cash",
        "class": "asset",
        "status": "active",
        "currency": "USD",
        "profile": "standard",
        "owner": { "id": "c0ffee00-1234-4567-89ab-cdef01234567", "display_name": "Avery Ledgerwood", "email": "avery@example.com" },
        "created_at": "2026-01-15T09:30:00Z"
      }
    ],
    "total_count": 42,
    "has_more": true
  }`,

  /** The spec's createTransaction request example transfer, copied from openapi.yaml. */
  specExampleTransfer:
    '{ "kind": "transfer", "amount": "250.00", "counterparty_account_id": "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e", "memo": "Rent split" }'
} as const;

/**
 * The bound every hand-written paginator walk shares: a stub that leads back to an earlier page
 * fails its test within this many requests and names where the last page led, instead of hanging
 * the run.
 */
export const MAX_PAGE_REQUESTS = 10;

export function unfinishedWalk(next: string): Error {
  return new Error(
    `The paginator did not reach the last page in ${MAX_PAGE_REQUESTS} requests; the last page still led to ${next}.`
  );
}
