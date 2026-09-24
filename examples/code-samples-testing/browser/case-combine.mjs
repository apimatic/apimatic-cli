import { check, choose, done, finish, hasSelector, labels, note, open, options, panel } from './lib.mjs';

// cases/combine/catalogs.json is the code-samples/ output of codegen-v2's portal-artifacts endpoint
// for cases/combine/src. `curl` and `ts` are substrings of the tab for that selection; `ts: none`
// is the note shown when no snippet matches it.
const none = note('TypeScript');
const cases = {
  S01Overlap: {
    alpha: { curl: 'region=region-gamma', ts: 'region: "region-gamma", body: { id: "body-alpha" }' },
    beta: { curl: 'region=region-beta', ts: 'region: "region-beta", body: { id: "body-beta" }' }
  },
  S02Disjoint: {
    alpha: { curl: 'region=region-gamma', ts: 'region: "region-gamma", body: { id: "body-alpha" }' },
    beta: { curl: 'region=region-gamma', ts: 'region: "region-gamma", body: { id: "body-beta" }' }
  },
  S03QueryOnlyTwoIds: {
    summary: { curl: 'view=view-summary', ts: '{ view: "view-summary" }' },
    full: { curl: 'view=view-full', ts: '{ view: "view-full" }' }
  },
  S04QueryOnlyOneId: { null: { curl: 'view=view-only', ts: '{ view: "view-only" }' } },
  S05PathAndQuery: {
    summary: { curl: '/s05/item-byId?view=view-summary', ts: 'itemId: "item-byId", view: "view-summary"' },
    full: { curl: '/s05/item-byId?view=view-full', ts: 'itemId: "item-byId", view: "view-full"' }
  },
  S06BodySingularExample: {
    q1: { curl: 'region=region-q1', ts: 'region: "region-q1", body: { id: "body-singular" }' },
    q2: { curl: 'region=region-q2', ts: 'region: "region-q2", body: { id: "body-singular" }' }
  },
  S07BodyNoExample: {
    q1: { curl: 'region=region-q1', ts: '{ region: "region-q1" }' },
    q2: { curl: 'region=region-q2', ts: '{ region: "region-q2" }' }
  },
  S08BodyExampleKeyBesideNamed: {
    Example: { curl: 'body-Example', ts: none },
    alpha: { curl: 'body-alpha', ts: '{ body: { id: "body-alpha" } }' }
  },
  S09BodyOnlyExampleKey: {
    q1: { curl: 'region=region-q1', ts: 'region: "region-q1", body: { id: "body-Example" }' },
    q2: { curl: 'region=region-q2', ts: 'region: "region-q2", body: { id: "body-Example" }' }
  },
  S10OverlapOtherOrder: {
    a: { curl: '/s10/item-a', ts: 'itemId: "item-a", xTrace: "trace-b", body: { id: "body-a" }' },
    b: { curl: '/s10/item-b', ts: 'itemId: "item-b", xTrace: "trace-b", body: { id: "body-b" }' }
  },
  S11ParamsWithoutExamples: {
    null: { curl: 'must=string"', ts: 'must: "some example string", body: { id: "body-a" }' }
  },
  S12TwoMediaTypes: { null: { curl: 'json-j1', ts: 'client.s12TwoMediaTypes();' } },
  S13QueryAndHeaderDisjoint: {
    minimal: { curl: 'view=view-minimal', ts: 'view: "view-minimal", xTax: "tax-withTax"' },
    full: { curl: 'view=view-full', ts: 'view: "view-full", xTax: "tax-withTax"' }
  },
  S14CaseSensitiveIds: { null: { curl: 'region=region-upper', ts: 'region: "region-upper"' } },
  S15Summaries: {
    'US order': { curl: 'region=region-us', ts: 'region: "region-us", body: { id: "body-us" }' },
    'EU order': { curl: 'region=region-eu', ts: 'region: "region-eu", body: { id: "body-eu" }' }
  }
};

for (const [operation, examples] of Object.entries(cases)) {
  const route = `combine/cases/${operation}`;
  const page = await open(route);
  const names = Object.keys(examples);
  const selectable = names[0] !== 'null';
  check(`${route}: tabs`, await labels(page), ['cURL', 'TypeScript']);
  check(`${route}: selector shown`, await hasSelector(page), selectable);
  if (selectable) check(`${route}: selector lists the example ids`, await options(page), names);
  for (const [name, expected] of Object.entries(examples)) {
    if (selectable) await choose(page, name);
    check(`${route} [${name}]: curl has ${expected.curl}`, (await panel(page, 'curl')).includes(expected.curl), true);
    const code = await panel(page, 'typescript');
    if (expected.ts === none) check(`${route} [${name}]: TypeScript shows the note`, code, none);
    else check(`${route} [${name}]: TypeScript has ${expected.ts}`, code.includes(expected.ts), true);
  }
  await finish(page, route);
}

await done();
