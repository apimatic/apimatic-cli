import {
  check,
  choose,
  done,
  finish,
  hasSelector,
  labels,
  note,
  open,
  options,
  origin,
  panel,
  usageTabList
} from './lib.mjs';

{
  const route = 'store/orders/CreateOrder';
  const page = await open(route);
  check(`${route}: tabs are the catalog languages in order`, await labels(page), ['TypeScript', 'C#', 'Python']);
  check(`${route}: selector lists every request example`, await options(page), [
    'Minimal order',
    'Full order',
    'Bulk order'
  ]);
  const expected = {
    'Minimal order': ['TS-CREATE-MINIMAL', 'CS-CREATE-MINIMAL', note('Python')],
    'Full order': ['TS-CREATE-FULL', 'CS-CREATE-FULL', note('Python')],
    'Bulk order': [note('TypeScript'), 'CS-CREATE-BULK', note('Python')]
  };
  for (const [example, [ts, cs, py]] of Object.entries(expected)) {
    await choose(page, example);
    check(`${route} [${example}]: TypeScript`, await panel(page, 'typescript'), ts);
    check(`${route} [${example}]: C#`, await panel(page, 'csharp'), cs);
    check(
      `${route} [${example}]: Python (unnamed snippet never stands in for a named example)`,
      await panel(page, 'python'),
      py
    );
  }
  await choose(page, 'Minimal order');
  check(`${route}: returning to an example restores its snippet`, await panel(page, 'typescript'), 'TS-CREATE-MINIMAL');
  await finish(page, route);
}
{
  const route = 'store/orders/TagOrder';
  const page = await open(route);
  check(`${route}: tabs`, await labels(page), ['TypeScript', 'C#']);
  await choose(page, 'Same body, second');
  check(
    `${route} [second]: identical bodies still resolve to the chosen example`,
    await panel(page, 'typescript'),
    'TS-TAG-SECOND'
  );
  check(`${route} [second]: C# has no snippet for it`, await panel(page, 'csharp'), note('C#'));
  await choose(page, 'Same body, first');
  check(`${route} [first]: TypeScript`, await panel(page, 'typescript'), 'TS-TAG-FIRST');
  check(`${route} [first]: C#`, await panel(page, 'csharp'), 'CS-TAG-FIRST');
  await finish(page, route);
}
{
  const route = 'store/orders/ListOrders';
  const page = await open(route);
  check(`${route}: no request body means no selector`, await hasSelector(page), false);
  check(`${route}: tabs`, await labels(page), ['TypeScript', 'C#', 'Python']);
  check(`${route}: the only snippet (keyed Example) shows for _default`, await panel(page, 'typescript'), 'TS-LIST');
  check(
    `${route}: C# keeps Example beside other, so two snippets leave nothing to choose`,
    await panel(page, 'csharp'),
    note('C#')
  );
  check(`${route}: two snippets for one example leave nothing to choose`, await panel(page, 'python'), note('Python'));
  await finish(page, route);
}
{
  const route = 'store/orders/ReplaceOrder';
  const page = await open(route);
  check(`${route}: a single named example shows no selector`, await hasSelector(page), false);
  check(`${route}: tabs`, await labels(page), ['TypeScript']);
  check(`${route}: snippet keyed by the example name`, await panel(page, 'typescript'), 'TS-REPLACE');
  await finish(page, route);
}
{
  const route = 'store/orders/DeleteOrder';
  const page = await open(route);
  check(`${route}: hand-written x-codeSamples adds no tab`, await labels(page), []);
  check(
    `${route}: hand-written x-codeSamples text appears nowhere`,
    (await page.content()).includes('HANDWRITTEN-XCODESAMPLES</'),
    false
  );
  await finish(page, route);
}
{
  const route = 'store/orders/PatchOrder';
  const page = await open(route);
  check(`${route}: catalog tab, not the x-codeSamples one`, await labels(page), ['TypeScript']);
  check(`${route}: catalog snippet`, await panel(page, 'typescript'), 'TS-PATCH');
  await finish(page, route);
}
{
  const route = 'store/refunds/CreateRefund';
  const page = await open(route);
  await choose(page, 'Blank snippet');
  check(`${route} [blank]: an empty snippet is a snippet, not a missing one`, await panel(page, 'typescript'), '');
  check(
    `${route} [blank]: rendered as a code block`,
    await page.locator('[role=tabpanel][id$="-content-typescript"] pre').count(),
    1
  );
  await choose(page, 'Filled snippet');
  check(`${route} [filled]: TypeScript`, await panel(page, 'typescript'), 'TS-REFUND-FILLED');
  await finish(page, route);
}
{
  const route = 'store/imports/CreateImport';
  const page = await open(route);
  check(`${route}: selector lists the preferred media type's $ref examples`, await options(page), [
    'CSV import',
    'JSON import'
  ]);
  await choose(page, 'JSON import');
  check(`${route} [JSON import]: TypeScript`, await panel(page, 'typescript'), 'TS-IMPORT-JSON');
  await choose(page, 'CSV import');
  check(`${route} [CSV import]: TypeScript`, await panel(page, 'typescript'), 'TS-IMPORT-CSV');
  await finish(page, route);
}
{
  const route = 'store/legacy/GetLegacy';
  const page = await open(route);
  check(`${route}: hand-written x-apimatic-codeSamples renders; malformed entries are skipped`, await labels(page), [
    'Ruby'
  ]);
  check(`${route}: Ruby`, await panel(page, 'ruby'), 'client.legacy.get # HANDWRITTEN-APIMATIC');
  await finish(page, route);
}
for (const route of ['store/health/StoreHealth', 'inventory/health/InventoryHealth']) {
  const page = await open(route);
  check(`${route}: an endpoint in two specs gets the sample in both`, await labels(page), ['TypeScript']);
  check(`${route}: TypeScript`, await panel(page, 'typescript'), 'TS-HEALTH');
  await finish(page, route);
}
{
  const route = 'inventory/items/CreateItem';
  const page = await open(route);
  check(`${route}: YAML 3.1 spec with an in-spec $ref is sampled`, await labels(page), ['TypeScript']);
  await choose(page, 'Gadget');
  check(`${route} [Gadget]: TypeScript`, await panel(page, 'typescript'), 'TS-ITEM-GADGET');
  await finish(page, route);
}
{
  const route = 'outside/things/CreateThing';
  const page = await open(route);
  check(`${route}: a spec whose $ref leaves spec/ has no sample tabs`, await labels(page), []);
  await finish(page, route);
}
{
  const page = await open('store/orders/CreateOrder');
  await panel(page, 'csharp');
  await page.goto(`${origin}/api/store/orders/TagOrder/`, { waitUntil: 'networkidle' });
  const selected = await page.locator(`${usageTabList} > [aria-selected=true]`).innerText();
  check('the chosen language carries over to the next operation page', selected.trim(), 'C#');
  await page.close();
}

await done();
