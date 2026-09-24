import { check, choose, done, finish, hasSelector, labels, open, options, panel } from './lib.mjs';

const base = 'payments/payments';
const has = (text, part) => text.includes(part);

{
  const route = `${base}/createPayment`;
  const page = await open(route);
  check(`${route}: tabs are curl then the catalog languages`, await labels(page), [
    'cURL',
    'TypeScript',
    'C#',
    'Python'
  ]);
  check(`${route}: selector lists both examples`, await options(page), ['Only the required fields', 'Every field']);

  await choose(page, 'Only the required fields');
  const ts = await panel(page, 'typescript');
  check(
    `${route} [minimal]: TypeScript is the minimal snippet`,
    [has(ts, 'createPayment'), has(ts, "description: 'Order 42'")],
    [true, false]
  );
  check(
    `${route} [minimal]: C# is the minimal snippet`,
    has(await panel(page, 'csharp'), 'Description = "Order 42"'),
    false
  );
  check(
    `${route} [minimal]: Python is the minimal snippet`,
    has(await panel(page, 'python'), "description='Order 42'"),
    false
  );
  check(`${route} [minimal]: curl carries the minimal body`, has(await panel(page, 'curl'), 'Order 42'), false);

  await choose(page, 'Every field');
  check(
    `${route} [full]: TypeScript is the full snippet`,
    has(await panel(page, 'typescript'), "description: 'Order 42'"),
    true
  );
  check(`${route} [full]: C# is the full snippet`, has(await panel(page, 'csharp'), 'Description = "Order 42"'), true);
  check(
    `${route} [full]: Python is the full snippet`,
    has(await panel(page, 'python'), "description='Order 42'"),
    true
  );
  check(
    `${route} [full]: curl carries the full body`,
    has(await panel(page, 'curl'), '"description": "Order 42"'),
    true
  );
  await finish(page, route);
}

const single = {
  listPayments: [
    'client.payments.listPayments(10)',
    'ListPaymentsAsync(limit: 10)',
    'client.payments.list_payments(limit=10)'
  ],
  getPayment: [
    "client.payments.getPayment('pay_123')",
    'GetPaymentAsync("pay_123")',
    "client.payments.get_payment('pay_123')"
  ],
  cancelPayment: ["client.payments.cancelPayment('pay_123')", null, "client.payments.cancel_payment('pay_123')"]
};
for (const [operation, [ts, cs, py]] of Object.entries(single)) {
  const route = `${base}/${operation}`;
  const page = await open(route);
  check(`${route}: no selector for an operation without body examples`, await hasSelector(page), false);
  check(`${route}: tabs`, await labels(page), ['cURL', 'TypeScript', 'C#', 'Python']);
  check(`${route}: TypeScript shows its only snippet`, has(await panel(page, 'typescript'), ts), true);
  if (cs) check(`${route}: C# shows its only snippet`, has(await panel(page, 'csharp'), cs), true);
  check(`${route}: Python shows its only snippet`, has(await panel(page, 'python'), py), true);
  await finish(page, route);
}

await done();
