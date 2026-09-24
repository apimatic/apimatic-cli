/**
 * The fixed fields of a path item that hold an operation, OpenAPI 3.2's `query` included.
 * Fumadocs builds pages for fewer of them, but any it keeps rides along in every page's payload.
 * The methods 3.2 allows beyond these sit apart, under `additionalOperations`.
 */
export const OPERATION_METHODS: readonly string[] = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
  'query'
];
