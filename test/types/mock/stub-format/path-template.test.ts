import { expect } from 'chai';
import { PathTemplate } from '../../../../src/types/mock/stub-format/path-template.js';

const parsed = (template: string): PathTemplate => PathTemplate.parse(template)._unsafeUnwrap();

describe('PathTemplate', () => {
  for (const [template, path, expected] of [
    ['/v1/accounts', '/v1/accounts', true],
    ['/v1/accounts', '/v1/accounts/', false],
    ['/v1/accounts', '/v1/Accounts', false],
    ['/v1/accounts/{id}', '/v1/accounts/7a1b', true],
    ['/v1/accounts/{id}', '/v1/accounts/7a1b/balance', false],
    ['/v1/accounts/{id}', '/v1/accounts/', false],
    ['/v1/accounts/{id}/transactions', '/v1/accounts/x/transactions', true],
    ['/v1/accounts/{account_id}/documents/{doc-id}', '/v1/accounts/acc_1/documents/doc_2', true],
    ['/health', '/health', true],
    ['/v1/a.b', '/v1/aXb', false],
    ['/', '/', true],
    ['/', '/v1', false],
    ['/', '', false],
    ['/v1/accounts/', '/v1/accounts/', true],
    ['/v1/accounts/', '/v1/accounts', false]
  ] as const) {
    it(`${expected ? 'matches' : 'does not match'} '${path}' against ${template}`, () => {
      const pathTemplate = parsed(template);

      const matches = pathTemplate.matches(path);

      expect(matches).to.equal(expected);
    });
  }

  it('is written back as it was read', () => {
    const template = parsed('/v1/accounts/{account_id}/documents/{doc-id}');

    const written = template.toString();

    expect(written).to.equal('/v1/accounts/{account_id}/documents/{doc-id}');
  });

  for (const [template, literal] of [
    ['/v1/accounts', true],
    ['/', true],
    ['/v1/accounts/{id}', false]
  ] as const) {
    it(`finds ${template} ${literal ? 'literal' : 'not literal'}`, () => {
      const pathTemplate = parsed(template);

      const result = pathTemplate.isLiteral();

      expect(result).to.equal(literal);
    });
  }

  for (const [first, second, equal] of [
    ['/v1/accounts/{id}', '/v1/accounts/{id}', true],
    ['/v1/{a}', '/v1/{b}', false],
    ['/v1/x', '/v1/{x}', false],
    ['/v1/x', '/v1/x/', false]
  ] as const) {
    it(`finds ${first} and ${second} ${equal ? 'equal' : 'different'}, as they are written`, () => {
      const template = parsed(first);

      const result = template.isEqual(parsed(second));

      expect(result).to.equal(equal);
    });
  }

  it('holds the root as a template of its own', () => {
    const root = PathTemplate.root;

    const written = [root.toString(), root.matches('/'), root.isEqual(parsed('/'))];

    expect(written).to.deep.equal(['/', true, true]);
  });

  for (const [template, fault] of [
    ['v1/accounts', "start with '/'"],
    ['/v1/x{id}', 'whole segment'],
    ['/v1/{}', 'not a valid path parameter'],
    ['/v1/{a b}', 'not a valid path parameter'],
    ['/v1/x?y=1', 'query string'],
    ['/v1/x#top', 'query string'],
    ['/v1/users/jo%40example.com', "'jo%40example.com' is percent-encoded"],
    ['/v1/a+b', "'a+b' is percent-encoded or holds '+'"],
    ['/v1//accounts', 'no empty segments'],
    ['//v1/accounts', 'no empty segments'],
    ['/v1/accounts//', 'no empty segments'],
    ['//', 'no empty segments'],
    ['/a/../b', "'..' is a dot segment"],
    ['/c/./d', "'.' is a dot segment"],
    ['/v1/..', "'..' is a dot segment"]
  ]) {
    it(`refuses ${template}, naming the fault`, () => {
      const parsing = PathTemplate.parse(template);

      expect(parsing._unsafeUnwrapErr().join(' ')).to.include(fault);
    });
  }

  it('names each of two bad segments', () => {
    const template = '/a{b}/{c d}';

    const problems = PathTemplate.problems(template);

    expect(problems).to.deep.equal([
      "'a{b}' mixes literal text and braces; a parameter must be a whole segment such as {id}.",
      "'{c d}' is not a valid path parameter; use {name} with letters, digits, '_', '-' or '.'."
    ]);
  });

  it('names a query string once, and none of its text as a segment', () => {
    const template = '/v1//{a b}//x?next=http://x+y';

    const problems = PathTemplate.problems(template);

    expect(problems).to.deep.equal([
      "A path carries no query string or fragment; put query parameters under 'query'.",
      "A path has no empty segments ('//'); join a base path that ends in '/' to the operation path with one '/', as an SDK does.",
      "'{a b}' is not a valid path parameter; use {name} with letters, digits, '_', '-' or '.'."
    ]);
  });

  it('names a missing leading slash and still checks the rest behind it', () => {
    const template = 'v1//{a b}';

    const problems = PathTemplate.problems(template);

    expect(problems).to.deep.equal([
      "A path must start with '/'.",
      "A path has no empty segments ('//'); join a base path that ends in '/' to the operation path with one '/', as an SDK does.",
      "'{a b}' is not a valid path parameter; use {name} with letters, digits, '_', '-' or '.'."
    ]);
  });

  for (const template of [
    '/',
    '/v1/accounts/',
    '/v1/accounts/{account_id}/documents/{doc-id}',
    '/e/.../f',
    '/.well-known/openid-configuration'
  ]) {
    it(`finds nothing wrong with ${template}`, () => {
      const problems = PathTemplate.problems(template);

      expect(problems).to.deep.equal([]);
    });
  }
});
