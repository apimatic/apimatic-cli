import { check, choose, done, finish, hasSelector, labels, note, open, options, panel } from './lib.mjs';

// cases/combine/catalogs.json is the code-samples/ output of codegen-v2's portal-artifacts endpoint
// for cases/combine/src. Each expectation is a substring of the TypeScript tab for that example,
// or `none`, the note shown when no snippet matches it.
const none = note('TypeScript');
const cases = {
  S01Overlap: {
    alpha: 'region: "region-gamma", body: { id: "body-alpha" }',
    beta: 'region: "region-beta", body: { id: "body-beta" }'
  },
  S02Disjoint: {
    alpha: 'region: "region-gamma", body: { id: "body-alpha" }',
    beta: 'region: "region-gamma", body: { id: "body-beta" }'
  },
  S03QueryOnlyTwoIds: { summary: '{ view: "view-summary" }', full: '{ view: "view-full" }' },
  S04QueryOnlyOneId: { null: '{ view: "view-only" }' },
  S05PathAndQuery: {
    summary: 'itemId: "item-byId", view: "view-summary"',
    full: 'itemId: "item-byId", view: "view-full"'
  },
  S06BodySingularExample: {
    q1: 'region: "region-q1", body: { id: "body-singular" }',
    q2: 'region: "region-q2", body: { id: "body-singular" }'
  },
  S07BodyNoExample: { q1: '{ region: "region-q1" }', q2: '{ region: "region-q2" }' },
  S08BodyExampleKeyBesideNamed: { Example: none, alpha: '{ body: { id: "body-alpha" } }' },
  S09BodyOnlyExampleKey: {
    q1: 'region: "region-q1", body: { id: "body-Example" }',
    q2: 'region: "region-q2", body: { id: "body-Example" }'
  },
  S10OverlapOtherOrder: {
    a: 'itemId: "item-a", xTrace: "trace-b", body: { id: "body-a" }',
    b: 'itemId: "item-b", xTrace: "trace-b", body: { id: "body-b" }'
  },
  S11ParamsWithoutExamples: { null: 'must: "some example string", body: { id: "body-a" }' },
  S12TwoMediaTypes: { null: 'client.s12TwoMediaTypes();' },
  S13QueryAndHeaderDisjoint: {
    minimal: 'view: "view-minimal", xTax: "tax-withTax"',
    full: 'view: "view-full", xTax: "tax-withTax"'
  },
  S14CaseSensitiveIds: { null: 'region: "region-upper"' },
  S15Summaries: {
    'US order': 'region: "region-us", body: { id: "body-us" }',
    'EU order': 'region: "region-eu", body: { id: "body-eu" }'
  }
};

for (const [operation, examples] of Object.entries(cases)) {
  const route = `combine/cases/${operation}`;
  const page = await open(route);
  const names = Object.keys(examples);
  const selectable = names[0] !== 'null';
  check(`${route}: tabs`, await labels(page), ['TypeScript']);
  check(`${route}: selector shown`, await hasSelector(page), selectable);
  if (selectable) check(`${route}: selector lists the example ids`, await options(page), names);
  for (const [name, expected] of Object.entries(examples)) {
    if (selectable) await choose(page, name);
    const code = await panel(page, 'typescript');
    if (expected === none) check(`${route} [${name}]: TypeScript shows the note`, code, none);
    else check(`${route} [${name}]: TypeScript has ${expected}`, code.includes(expected), true);
  }
  await finish(page, route);
}

await done();
