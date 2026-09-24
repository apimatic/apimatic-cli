import { browser, check, choose, done, finish, labels, open, options, origin, panel, panelElement } from './lib.mjs';

const languages = [
  ['typescript', 'TypeScript'],
  ['csharp', 'C#'],
  ['python', 'Python'],
  ['java', 'Java'],
  ['php', 'PHP'],
  ['ruby', 'Ruby'],
  ['go', 'Go']
];

{
  const route = 'edge/languages/ListLanguages';
  const page = await open(route);
  check(
    `${route}: all seven languages, in catalog order; the empty Java catalog adds nothing`,
    await labels(page),
    languages.map(([, label]) => label)
  );
  for (const [id, label] of languages) {
    check(`${route}: ${label} snippet`, await panel(page, id), `${id.toUpperCase()}-LANGUAGES`);
  }
  await finish(page, route);
}
{
  const route = 'edge/messages/SendMessage';
  const page = await open(route);
  check(`${route}: selector lists the awkward example ids by summary`, await options(page), [
    'Id with a space',
    'Id with a slash',
    'Unicode id',
    'HTML in the snippet'
  ]);
  for (const [example, snippet] of [
    ['Id with a space', 'TS-SPACE'],
    ['Id with a slash', 'TS-SLASH'],
    ['Unicode id', 'TS-UNICODE ✓ — ünïcode']
  ]) {
    await choose(page, example);
    check(`${route} [${example}]: TypeScript`, await panel(page, 'typescript'), snippet);
  }
  await choose(page, 'HTML in the snippet');
  const html = 'const x = "<script>window.__xss = 1</script><b>not bold</b>";';
  check(`${route} [HTML]: markup in a snippet is shown as text`, await panel(page, 'typescript'), html);
  check(
    `${route} [HTML]: and never parsed or run`,
    [await page.evaluate('window.__xss'), await (await panelElement(page, 'typescript')).locator('b, script').count()],
    [undefined, 0]
  );
  await finish(page, route);
}
{
  const route = 'edge/languages/BigSnippet';
  const page = await open(route);
  const lines = (await panel(page, 'typescript')).split('\n');
  check(
    `${route}: a 400-line snippet renders whole`,
    [lines.length, lines[0], lines.at(-1)],
    [400, 'const line0 = 0;', 'const line399 = 399;']
  );
  const colours = await (await panelElement(page, 'typescript'))
    .locator('pre span[style*="--shiki"]')
    .evaluateAll((spans) => new Set(spans.map((span) => span.getAttribute('style'))).size);
  check(`${route}: TypeScript is syntax-highlighted (more than one token colour)`, colours > 1, true);
  await finish(page, route);
}
{
  const route = 'edge/unknown/Untagged';
  const page = await open(route);
  check(
    `${route}: an untagged operation still gets its sample`,
    [await labels(page), await panel(page, 'typescript')],
    [['TypeScript'], 'TS-UNTAGGED']
  );
  await finish(page, route);
}
{
  const route = 'edge/webhooks/OrderPaid';
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const response = await page.goto(`${origin}/api/${route}/`, { waitUntil: 'networkidle' });
  check(
    `${route}: the webhook page renders`,
    [response.status(), (await page.content()).includes('Order paid')],
    [200, true]
  );
  check(
    `${route}: webhooks stay without SDK tabs`,
    await page.locator('[role=tab][id$="-trigger-typescript"]').count(),
    0
  );
  check(`${route}: no page errors`, errors, []);
  await page.close();
}

await done();
