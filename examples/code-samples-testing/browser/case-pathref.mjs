import { check, done, finish, labels, open, panel } from './lib.mjs';

for (const spec of ['external', 'internal', 'opref']) {
  const route = `${spec}/pets/Inline`;
  const page = await open(route);
  check(
    `${route}: the inline operation beside the $ref gets its sample`,
    [await labels(page), await panel(page, 'typescript')],
    [['TypeScript'], 'TS-INLINE']
  );
  await finish(page, route);
}

for (const spec of ['external', 'internal']) {
  for (const operation of ['ListPets', 'CreatePet']) {
    const route = `${spec}/pets/${operation}`;
    const page = await open(route);
    check(`${route}: KNOWN FUMADOCS BUG - a path item that is a $ref gets no page`, page.status, 404);
    await page.close();
  }
}

{
  const route = 'opref/unknown/pets/get';
  const page = await open(route);
  check(
    `${route}: KNOWN FUMADOCS BUG - an operation that is a $ref is filed under unknown and named by its method`,
    page.status,
    200
  );
  check(
    `${route}: the sample the CLI set beside the operation $ref still renders`,
    [await labels(page), await panel(page, 'typescript')],
    [['TypeScript'], 'TS-PETS-LIST']
  );
  check(
    `${route}: KNOWN FUMADOCS BUG - the page shows none of the operation's details, not even its summary`,
    (await page.content()).includes('List pets'),
    false
  );
  await finish(page, route);
}

await done();
