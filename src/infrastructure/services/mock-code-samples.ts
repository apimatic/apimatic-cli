import { Language } from '../../types/sdk/generate.js';

/** The catalogs `/api/portal-artifacts` would return for `test/resources/portal-inputs/code-samples`. */
export const MOCK_CODE_SAMPLES: ReadonlyArray<[Language, unknown]> = [
  [
    Language.TYPESCRIPT,
    {
      paths: {
        '/payments': {
          GET: {
            Example: [
              "const client = new Client({ accessToken: 'ACCESS_TOKEN' });",
              '',
              'const { result } = await client.payments.listPayments(10);'
            ].join('\n')
          },
          POST: {
            minimal: [
              "const client = new Client({ accessToken: 'ACCESS_TOKEN' });",
              '',
              'const { result } = await client.payments.createPayment({',
              '  amount: 1000,',
              "  currency: 'USD',",
              '});'
            ].join('\n'),
            full: [
              "const client = new Client({ accessToken: 'ACCESS_TOKEN' });",
              '',
              'const { result } = await client.payments.createPayment({',
              '  amount: 1000,',
              "  currency: 'USD',",
              "  description: 'Order 42',",
              "  metadata: { orderId: '42' },",
              '});'
            ].join('\n')
          }
        },
        '/payments/{paymentId}': {
          GET: {
            Example: [
              "const client = new Client({ accessToken: 'ACCESS_TOKEN' });",
              '',
              "const { result } = await client.payments.getPayment('pay_123');"
            ].join('\n')
          },
          DELETE: {
            Example: [
              "const client = new Client({ accessToken: 'ACCESS_TOKEN' });",
              '',
              "await client.payments.cancelPayment('pay_123');"
            ].join('\n')
          }
        }
      }
    }
  ],
  [
    Language.CSHARP,
    {
      paths: {
        '/payments': {
          GET: {
            Example: [
              'var client = new PaymentsClient.Builder().AccessToken("ACCESS_TOKEN").Build();',
              '',
              'var payments = await client.PaymentsController.ListPaymentsAsync(limit: 10);'
            ].join('\n')
          },
          POST: {
            minimal: [
              'var client = new PaymentsClient.Builder().AccessToken("ACCESS_TOKEN").Build();',
              '',
              'var payment = await client.PaymentsController.CreatePaymentAsync(new NewPayment',
              '{',
              '    Amount = 1000,',
              '    Currency = "USD",',
              '});'
            ].join('\n'),
            full: [
              'var client = new PaymentsClient.Builder().AccessToken("ACCESS_TOKEN").Build();',
              '',
              'var payment = await client.PaymentsController.CreatePaymentAsync(new NewPayment',
              '{',
              '    Amount = 1000,',
              '    Currency = "USD",',
              '    Description = "Order 42",',
              '    Metadata = new Dictionary<string, string> { ["orderId"] = "42" },',
              '});'
            ].join('\n')
          }
        },
        '/payments/{paymentId}': {
          GET: {
            Example: [
              'var client = new PaymentsClient.Builder().AccessToken("ACCESS_TOKEN").Build();',
              '',
              'var payment = await client.PaymentsController.GetPaymentAsync("pay_123");'
            ].join('\n')
          },
          DELETE: {
            Example: [
              'var client = new PaymentsClient.Builder().AccessToken("ACCESS_TOKEN").Build();',
              '',
              'await client.PaymentsController.CancelPaymentAsync("pay_123");'
            ].join('\n')
          }
        }
      }
    }
  ],
  [
    Language.PYTHON,
    {
      paths: {
        '/payments': {
          GET: {
            Example: [
              "client = PaymentsClient(access_token='ACCESS_TOKEN')",
              '',
              'payments = client.payments.list_payments(limit=10)'
            ].join('\n')
          },
          POST: {
            minimal: [
              "client = PaymentsClient(access_token='ACCESS_TOKEN')",
              '',
              "payment = client.payments.create_payment(NewPayment(amount=1000, currency='USD'))"
            ].join('\n'),
            full: [
              "client = PaymentsClient(access_token='ACCESS_TOKEN')",
              '',
              'payment = client.payments.create_payment(NewPayment(',
              '    amount=1000,',
              "    currency='USD',",
              "    description='Order 42',",
              "    metadata={'orderId': '42'},",
              '))'
            ].join('\n')
          }
        },
        '/payments/{paymentId}': {
          GET: {
            Example: [
              "client = PaymentsClient(access_token='ACCESS_TOKEN')",
              '',
              "payment = client.payments.get_payment('pay_123')"
            ].join('\n')
          },
          DELETE: {
            Example: [
              "client = PaymentsClient(access_token='ACCESS_TOKEN')",
              '',
              "client.payments.cancel_payment('pay_123')"
            ].join('\n')
          }
        }
      }
    }
  ]
];
