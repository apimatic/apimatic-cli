import { expect } from 'chai';
import { writeIssuedCode } from '../../../../src/types/mock/auth/issued-code.js';
import { OAuth2Server } from '../../../../src/types/mock/auth/oauth2-server.js';
import { writeJson } from '../../../../src/types/mock/json/json-writer.js';
import { Difference } from '../../../../src/types/mock/matching/difference.js';
import { Verdict } from '../../../../src/types/mock/matching/verdict.js';
import { OAuth2Flow, OAuth2Settings } from '../../../../src/types/mock/stub-format/oauth2-settings.js';
import { oauth2 } from '../../../helpers/mock-oauth2.js';
import { ledger, TestRequest } from '../../../helpers/mock-requests.js';
import { sampleOAuth2 } from '../../../helpers/mock-stubs.js';

const REDIRECT_URI_RULE = 'an absolute non-file URI in printable ASCII, without a fragment';
const CHALLENGE_RULE = 'a base64url S256 challenge of 43 characters';
const DECLARED = 'one of ledger:read, ledger:write, audit:read';
const OFFERED = 'client_credentials, authorization_code, refresh_token or password';
const ONE_SCOPE = 'one space-delimited scope parameter';
const VERIFIER_FORMAT = 'a verifier of 43 to 128 characters of A-Z a-z 0-9 - . _ ~';

const settings = (): OAuth2Settings => sampleOAuth2('oauth2 authorization server').settings;
const serverWith = (changes: Partial<OAuth2Settings>) => new OAuth2Server({ ...settings(), ...changes });
const answer = (request: TestRequest, server = serverWith({})): Verdict | undefined => server.answer(request.build());
const answered = (request: TestRequest, server = serverWith({})): Verdict => {
  const verdict = answer(request, server);
  if (verdict === undefined) {
    throw new Error('The OAuth2 server left the request to the stubs.');
  }
  return verdict;
};
/** The token document as it goes on the wire, or the differences of a refusal. */
const token = (request: TestRequest, server = serverWith({})) => {
  const verdict = answered(request, server);
  const body = verdict.kind === 'served' ? verdict.response.body : undefined;
  return body?.kind === 'json' ? writeJson(body.json) : verdict;
};
const refusal = (request: TestRequest, server = serverWith({})) => {
  const verdict = answered(request, server);
  return verdict.kind === 'rejected' ? verdict.differences : verdict;
};
const location = (request: TestRequest, server = serverWith({})) => {
  const verdict = answered(request, server);
  return verdict.kind === 'served'
    ? verdict.response.headers.find((header) => header.name === 'Location')?.value
    : verdict;
};
const issuedCode = (challenge: string = oauth2.challenge, scope: string = oauth2.scope) =>
  writeIssuedCode({ challenge, scope, redirectUri: oauth2.redirectUri });
const auth = (name: string, expected: string, actual: string) => new Difference('auth', name, expected, actual);
const form = (name: string, expected: string, actual: string) => new Difference('form', name, expected, actual);
const query = (name: string, expected: string, actual: string) => new Difference('query', name, expected, actual);
const basic = (credentials: string) => oauth2.basicCredentials(credentials);
const tokenOf = (accessToken: string, more = '') =>
  `{"access_token":"${accessToken}","token_type":"Bearer","expires_in":3600${more}}`;
const firstTokens = (scope = `,"scope":"${oauth2.scope}"`) =>
  tokenOf('ac-access-token-1', `,"refresh_token":"ac-refresh-token-1"${scope}`);
const exchangeWith = (...fields: (readonly [string, string])[]) =>
  oauth2.token(['grant_type', 'authorization_code'], ['code', issuedCode()], ...fields);
const codeFlow: OAuth2Flow = {
  kind: 'authorizationCode',
  authorizePath: oauth2.authorizePath,
  accessTokenPrefix: 'ac-access-token-',
  refreshTokenPrefix: 'ac-refresh-token-'
};
const implicitFlow: OAuth2Flow = {
  kind: 'implicit',
  authorizePath: oauth2.authorizePath,
  accessToken: ledger.implicitToken
};
const clientCredentialsFlow: OAuth2Flow = { kind: 'clientCredentials', accessToken: ledger.clientCredentialsToken };

describe('OAuth2Server, at the token path with client credentials', () => {
  for (const [title, request, expected] of [
    ['the secret in the form', oauth2.clientCredentials(), tokenOf('cc-access-token', ',"scope":"ledger:write"')],
    [
      'a Basic header',
      oauth2.clientCredentialsBasic(),
      tokenOf('cc-access-token', ',"scope":"ledger:read ledger:write audit:read"')
    ],
    [
      'a Basic header and the same client id in the form',
      oauth2.clientCredentialsBasic(undefined, ['client_id', ledger.clientId]),
      tokenOf('cc-access-token', ',"scope":"ledger:read ledger:write audit:read"')
    ],
    [
      'a Basic header and an empty client_id in the form',
      oauth2.clientCredentialsBasic(undefined, ['client_id', '']),
      tokenOf('cc-access-token', ',"scope":"ledger:read ledger:write audit:read"')
    ],
    [
      'a Basic header and an empty client_secret in the form',
      oauth2.clientCredentialsBasic(undefined, ['client_secret', '']),
      tokenOf('cc-access-token', ',"scope":"ledger:read ledger:write audit:read"')
    ],
    [
      'two scopes joined by a plus, each read as a space',
      oauth2.clientCredentials('ledger:read audit:read'),
      tokenOf('cc-access-token', ',"scope":"ledger:read audit:read"')
    ],
    [
      'no scope, which grants every declared one',
      oauth2.token(
        ['grant_type', 'client_credentials'],
        ['client_id', ledger.clientId],
        ['client_secret', ledger.clientSecret]
      ),
      tokenOf('cc-access-token', ',"scope":"ledger:read ledger:write audit:read"')
    ],
    [
      'an empty scope, which grants every declared one',
      oauth2.clientCredentials(''),
      tokenOf('cc-access-token', ',"scope":"ledger:read ledger:write audit:read"')
    ],
    [
      'a form Content-Type that names a charset',
      TestRequest.post(oauth2.tokenPath).text(
        'grant_type=client_credentials&client_id=test-client-id&client_secret=test-client-secret',
        'application/x-www-form-urlencoded;charset=utf-8'
      ),
      tokenOf('cc-access-token', ',"scope":"ledger:read ledger:write audit:read"')
    ]
  ] as const) {
    it(`issues the token for ${title}`, () => {
      const issued = token(request);

      expect(issued).to.equal(expected);
    });
  }

  it('reads a Basic header as form-encoded, a plus as a space', () => {
    const server = serverWith({ clientId: 'my client', clientSecret: 's3cr+t x' });

    const issued = token(oauth2.clientCredentialsBasic('my+client:s3cr%2Bt+x'), server);

    expect(issued).to.include('"access_token":"cc-access-token"');
  });

  it('tells a client not to store or cache the token', () => {
    const verdict = answered(oauth2.clientCredentials());

    expect(verdict.kind === 'served' ? verdict.response.headers : verdict).to.deep.equal([
      { name: 'Cache-Control', value: 'no-store' },
      { name: 'Pragma', value: 'no-cache' }
    ]);
  });

  it('issues the lifetime the settings name', () => {
    const issued = token(oauth2.clientCredentials(), serverWith({ expiresIn: 60 }));

    expect(issued).to.include('"expires_in":60');
  });

  for (const [title, request, differences] of [
    [
      'a secret in the form beside the one in a Basic header, naming both',
      oauth2.clientCredentialsBasic(undefined, ['client_secret', ledger.clientSecret]),
      [auth('client_secret', ledger.clientSecret, 'test-client-secret & test-client-secret')]
    ],
    [
      'another client id in the form beside a Basic header, naming both',
      oauth2.clientCredentialsBasic(undefined, ['client_id', 'someone-else']),
      [auth('client_id', ledger.clientId, 'test-client-id & someone-else')]
    ],
    [
      'the client id twice in the form beside a Basic header, naming every one',
      oauth2.clientCredentialsBasic(undefined, ['client_id', ledger.clientId], ['client_id', ledger.clientId]),
      [auth('client_id', ledger.clientId, 'test-client-id & test-client-id & test-client-id')]
    ],
    [
      'a Basic header without a colon, shown as sent, beside a secret in the form',
      oauth2.clientCredentialsBasic(ledger.clientId, ['client_secret', ledger.clientSecret]),
      [
        auth('client_id', ledger.clientId, 'Basic dGVzdC1jbGllbnQtaWQ='),
        auth('client_secret', ledger.clientSecret, 'absent')
      ]
    ],
    [
      'a Basic header without a colon, shown as sent',
      oauth2.clientCredentialsBasic(ledger.clientId),
      [
        auth('client_id', ledger.clientId, 'Basic dGVzdC1jbGllbnQtaWQ='),
        auth('client_secret', ledger.clientSecret, 'absent')
      ]
    ],
    [
      'a Basic header that is no base64, shown as sent',
      oauth2.token(['grant_type', 'client_credentials']).header('Authorization', 'Basic not-base64!'),
      [auth('client_id', ledger.clientId, 'Basic not-base64!'), auth('client_secret', ledger.clientSecret, 'absent')]
    ],
    [
      'a Basic header that holds the client id unencoded, shown as sent',
      oauth2.token(['grant_type', 'client_credentials']).header('Authorization', `Basic ${ledger.clientId}`),
      [auth('client_id', ledger.clientId, 'Basic test-client-id'), auth('client_secret', ledger.clientSecret, 'absent')]
    ],
    [
      'a Basic header with an empty secret',
      oauth2.clientCredentialsBasic(`${ledger.clientId}:`),
      [auth('client_secret', ledger.clientSecret, '')]
    ],
    [
      'two Authorization headers, although the form holds the right credentials',
      oauth2.clientCredentials().header('Authorization', basic('a:b')).header('Authorization', basic('c:d')),
      [
        auth('client_id', ledger.clientId, 'Basic YTpi & Basic Yzpk'),
        auth('client_secret', ledger.clientSecret, 'absent')
      ]
    ],
    [
      'the right Basic header sent twice',
      oauth2
        .token(['grant_type', 'client_credentials'])
        .header('Authorization', basic(`${ledger.clientId}:${ledger.clientSecret}`))
        .header('Authorization', basic(`${ledger.clientId}:${ledger.clientSecret}`)),
      [
        auth(
          'client_id',
          ledger.clientId,
          `${basic(`${ledger.clientId}:${ledger.clientSecret}`)} & ${basic(
            `${ledger.clientId}:${ledger.clientSecret}`
          )}`
        ),
        auth('client_secret', ledger.clientSecret, 'absent')
      ]
    ],
    [
      'another client secret',
      oauth2.token(['grant_type', 'client_credentials'], ['client_id', ledger.clientId], ['client_secret', 'nope']),
      [auth('client_secret', ledger.clientSecret, 'nope')]
    ],
    [
      'no client secret',
      oauth2.token(['grant_type', 'client_credentials'], ['client_id', ledger.clientId]),
      [auth('client_secret', ledger.clientSecret, 'absent')]
    ],
    [
      'another client id',
      oauth2.token(
        ['grant_type', 'client_credentials'],
        ['client_id', 'someone-else'],
        ['client_secret', ledger.clientSecret]
      ),
      [auth('client_id', ledger.clientId, 'someone-else')]
    ],
    [
      'a scope the stub does not declare',
      oauth2.clientCredentials('ledger:write ledger:admin'),
      [form('scope', DECLARED, 'ledger:admin')]
    ],
    ...['  ', 'ledger:read ', ' ledger:read', 'ledger:read  audit:read'].map(
      (scope) =>
        [
          `the scope '${scope}', which holds an empty token`,
          oauth2.clientCredentials(scope),
          [form('scope', DECLARED, '')]
        ] as const
    ),
    [
      'the scope parameter sent twice',
      oauth2.token(
        ['grant_type', 'client_credentials'],
        ['client_id', ledger.clientId],
        ['client_secret', ledger.clientSecret],
        ['scope', 'ledger:read'],
        ['scope', 'ledger:write']
      ),
      [form('scope', ONE_SCOPE, 'ledger:read & ledger:write')]
    ],
    [
      'a form body that starts with a question mark, which leaves it without a grant_type',
      TestRequest.post(oauth2.tokenPath).text(
        '?grant_type=client_credentials&client_id=test-client-id&client_secret=test-client-secret',
        'application/x-www-form-urlencoded'
      ),
      [form('grant_type', OFFERED, 'absent')]
    ],
    [
      'a JSON body',
      TestRequest.post(oauth2.tokenPath).json('{"grant_type":"client_credentials"}'),
      [new Difference('header', 'Content-Type', 'application/x-www-form-urlencoded', 'application/json')]
    ],
    [
      'a GET, naming the method and the Content-Type',
      TestRequest.get(oauth2.tokenPath),
      [
        new Difference('method', '', 'POST', 'GET'),
        new Difference('header', 'Content-Type', 'application/x-www-form-urlencoded', 'absent')
      ]
    ],
    [
      'a method in lower case',
      TestRequest.of('post', oauth2.tokenPath).form(
        ['grant_type', 'client_credentials'],
        ['client_id', ledger.clientId],
        ['client_secret', ledger.clientSecret]
      ),
      [new Difference('method', '', 'POST', 'post')]
    ],
    [
      'a grant type no flow offers, naming the ones offered',
      oauth2.token(['grant_type', 'device_code'], ['client_id', ledger.clientId]),
      [form('grant_type', OFFERED, 'device_code')]
    ]
  ] as const) {
    it(`refuses ${title}`, () => {
      const found = refusal(request);

      expect(found).to.deep.equal(differences);
    });
  }

  it('says what was refused', () => {
    const verdict = answered(oauth2.token(['grant_type', 'client_credentials'], ['client_id', ledger.clientId]));

    expect(verdict.kind === 'rejected' ? verdict.what : verdict).to.equal('OAuth2 token request');
  });
});

describe('OAuth2Server, at the authorize path', () => {
  it('redirects a valid request with the code and the state', () => {
    const redirected = answered(oauth2.authorize());

    expect(redirected).to.deep.equal({
      kind: 'served',
      response: {
        status: 302,
        headers: [
          {
            name: 'Location',
            value:
              `http://localhost/callback?code=ac-code.${oauth2.challenge}.bGVkZ2VyOndyaXRlIGF1ZGl0OnJlYWQ` +
              '.aHR0cDovL2xvY2FsaG9zdC9jYWxsYmFjaw&state=s1'
          }
        ],
        body: { kind: 'empty' }
      }
    });
  });

  it('appends the code after an ampersand when the redirect URI has a query', () => {
    const redirected = location(oauth2.authorize('redirect_uri', 'http://localhost/callback?tenant=t1'));

    expect(redirected).to.include('http://localhost/callback?tenant=t1&code=ac-code.');
  });

  it('redirects to a private-use scheme, as a native app registers one', () => {
    const redirected = location(oauth2.authorize('redirect_uri', 'com.example.app:/callback'));

    expect(redirected).to.include('com.example.app:/callback?code=ac-code.');
  });

  it('redirects an implicit request with the token in the fragment', () => {
    const redirected = location(oauth2.authorizeImplicit());

    expect(redirected).to.equal(
      'http://localhost/callback#access_token=im-access-token&token_type=Bearer&expires_in=3600&scope=ledger%3Awrite%20audit%3Aread&state=s1'
    );
  });

  it('puts the lifetime the settings name in the fragment', () => {
    const redirected = location(oauth2.authorizeImplicit(), serverWith({ expiresIn: 60 }));

    expect(redirected).to.include('&expires_in=60&');
  });

  it('grants every declared scope to an implicit request that asks for none', () => {
    const redirected = location(oauth2.authorizeImplicitWithout('scope'));

    expect(redirected).to.include('&scope=ledger%3Aread%20ledger%3Awrite%20audit%3Aread&');
  });

  for (const [key, value, expected] of [
    ['response_type', 'id_token', 'code or token'],
    ['client_id', 'someone-else', 'test-client-id'],
    ['redirect_uri', 'not a uri', REDIRECT_URI_RULE],
    ['redirect_uri', '/callback', REDIRECT_URI_RULE],
    ['redirect_uri', 'C:\\callback', REDIRECT_URI_RULE],
    ['redirect_uri', 'file:///callback', REDIRECT_URI_RULE],
    ['redirect_uri', 'http://localhost/callback#x', REDIRECT_URI_RULE],
    ['redirect_uri', 'http://localhost/café', REDIRECT_URI_RULE],
    ['redirect_uri', 'http://localhost/a b', REDIRECT_URI_RULE],
    ['redirect_uri', 'http://localhost/cb\r\nX-Injected: 1', REDIRECT_URI_RULE],
    ['code_challenge', 'too-short', CHALLENGE_RULE],
    ['code_challenge', '13d31e961a1ad8ec2f16b10c4c982e0876a878ad6df144566ee1894acb70f9c3', CHALLENGE_RULE],
    ['code_challenge', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw+cM', CHALLENGE_RULE],
    ['code_challenge', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw.cM', CHALLENGE_RULE],
    ['code_challenge_method', 'plain', 'S256'],
    ['scope', 'ledger:admin', DECLARED]
  ]) {
    it(`refuses a code request whose ${key} is ${JSON.stringify(value)}, naming it`, () => {
      const differences = refusal(oauth2.authorize(key, value));

      expect(differences).to.deep.equal([query(key, expected, value)]);
    });
  }

  for (const [key, value, expected] of [
    ['client_id', 'someone-else', 'test-client-id'],
    ['redirect_uri', 'not a uri', REDIRECT_URI_RULE],
    ['redirect_uri', 'http://localhost/callback#x', REDIRECT_URI_RULE],
    ['scope', 'ledger:admin', DECLARED]
  ]) {
    it(`refuses an implicit request whose ${key} is ${JSON.stringify(value)}, naming it`, () => {
      const differences = refusal(oauth2.authorizeImplicit(key, value));

      expect(differences).to.deep.equal([query(key, expected, value)]);
    });
  }

  for (const [title, request, differences] of [
    [
      'a code request without PKCE, naming both challenge fields',
      oauth2.authorizeWithout('code_challenge', 'code_challenge_method'),
      [query('code_challenge_method', 'S256', 'absent'), query('code_challenge', CHALLENGE_RULE, 'absent')]
    ],
    [
      'a code request with an empty state, as one without',
      oauth2.authorize('state', ''),
      [query('state', 'a non-empty value', 'absent')]
    ],
    [
      'an implicit request with an empty state, as one without',
      oauth2.authorizeImplicit('state', ''),
      [query('state', 'a non-empty value', 'absent')]
    ],
    [
      'a POST',
      TestRequest.post(oauth2.authorizePath).form(['response_type', 'code']),
      [new Difference('method', '', 'GET', 'POST')]
    ],
    [
      'a code request with the scope parameter twice',
      oauth2.authorizeWithout('scope').query('scope', 'ledger:read', 'ledger:write'),
      [query('scope', ONE_SCOPE, 'ledger:read & ledger:write')]
    ],
    [
      'an implicit request with the scope parameter twice',
      oauth2.authorizeImplicitWithout('scope').query('scope', 'ledger:read', 'ledger:write'),
      [query('scope', ONE_SCOPE, 'ledger:read & ledger:write')]
    ]
  ] as const) {
    it(`refuses ${title}`, () => {
      const found = refusal(request);

      expect(found).to.deep.equal(differences);
    });
  }

  it('says what was refused', () => {
    const verdict = answered(oauth2.authorize('state', ''));

    expect(verdict.kind === 'rejected' ? verdict.what : verdict).to.equal('OAuth2 authorization request');
  });

  it('refuses the token response type on a path that offers the code flow alone, naming code', () => {
    const differences = refusal(oauth2.authorizeImplicit(), serverWith({ flows: [codeFlow] }));

    expect(differences).to.deep.equal([query('response_type', 'code', 'token')]);
  });

  it('refuses the code response type on a path that offers the implicit flow alone, naming token', () => {
    const differences = refusal(oauth2.authorize(), serverWith({ flows: [implicitFlow] }));

    expect(differences).to.deep.equal([query('response_type', 'token', 'code')]);
  });
});

describe('OAuth2Server, exchanging an authorization code', () => {
  for (const [title, request, expected] of [
    ['the code and its verifier', oauth2.exchange(issuedCode()), firstTokens()],
    [
      'a scope field, which it ignores for the scope of the code',
      exchangeWith(
        ['redirect_uri', oauth2.redirectUri],
        ['client_id', ledger.clientId],
        ['code_verifier', oauth2.verifier],
        ['scope', 'ledger:admin']
      ),
      firstTokens()
    ],
    [
      'an empty client secret in the form, as a public client sends none',
      exchangeWith(
        ['redirect_uri', oauth2.redirectUri],
        ['client_id', ledger.clientId],
        ['client_secret', ''],
        ['code_verifier', oauth2.verifier]
      ),
      firstTokens()
    ],
    [
      'a Basic header with an empty secret',
      exchangeWith(['redirect_uri', oauth2.redirectUri], ['code_verifier', oauth2.verifier]).header(
        'Authorization',
        basic(`${ledger.clientId}:`)
      ),
      firstTokens()
    ],
    ...[
      ['~', 43],
      ['.', 128]
    ].map(([character, length]) => {
      const verifier = String(character).repeat(Number(length));
      return [
        `a verifier of ${length} characters, a bound of its length`,
        oauth2.exchange(issuedCode(oauth2.challengeOf(verifier)), verifier),
        firstTokens()
      ] as const;
    })
  ] as const) {
    it(`issues the first numbered tokens for ${title}`, () => {
      const issued = token(request);

      expect(issued).to.equal(expected);
    });
  }

  it('issues tokens without a scope when the stub declares none', () => {
    const issued = token(oauth2.exchange(issuedCode(oauth2.challenge, '')), serverWith({ scopes: [] }));

    expect(issued).to.equal(firstTokens(''));
  });

  for (const verifier of [
    'abc',
    '0123456789abcdef0123456789abcdef',
    'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjX',
    'dBjftJeZ4CVP+mB92K27uhbUJU1p1r/wW1gFWFOEjXk=',
    oauth2.verifier.repeat(3)
  ]) {
    it(`refuses the verifier '${verifier.slice(0, 44)}' for its format, although it hashes to the challenge`, () => {
      const differences = refusal(oauth2.exchange(issuedCode(oauth2.challengeOf(verifier)), verifier));

      expect(differences).to.deep.equal([form('code_verifier', VERIFIER_FORMAT, verifier)]);
    });
  }

  for (const code of [
    'made-up-code',
    'ac-code.x.!!.aHR0cA',
    'ac-code.x.bGVkZ2Vy.!!',
    `ac-code.${oauth2.challenge}.bGVkZ2VyOmFkbWlu.aHR0cDovL2xvY2FsaG9zdC9jYWxsYmFjaw`
  ]) {
    it(`refuses the code '${code.slice(0, 30)}' as one it did not issue`, () => {
      const differences = refusal(oauth2.exchange(code));

      expect(differences).to.deep.equal([form('code', 'a code issued by /oauth2/authorize', code)]);
    });
  }

  for (const [title, request, differences] of [
    [
      'a verifier that does not hash to the challenge',
      oauth2.exchange(issuedCode(), 'not-the-verifier-that-made-the-challenge-0123456789'),
      [
        form(
          'code_verifier',
          'a verifier whose S256 hash is the code_challenge',
          'not-the-verifier-that-made-the-challenge-0123456789'
        )
      ]
    ],
    [
      'no verifier',
      exchangeWith(['redirect_uri', oauth2.redirectUri], ['client_id', ledger.clientId]),
      [form('code_verifier', 'the PKCE verifier', 'absent')]
    ],
    [
      'an empty verifier, as none',
      oauth2.exchange(issuedCode(), ''),
      [form('code_verifier', 'the PKCE verifier', 'absent')]
    ],
    [
      'no redirect URI',
      exchangeWith(['client_id', ledger.clientId], ['code_verifier', oauth2.verifier]),
      [form('redirect_uri', 'the redirect_uri sent to /oauth2/authorize', 'absent')]
    ],
    [
      'another redirect URI',
      exchangeWith(
        ['redirect_uri', 'http://localhost/other'],
        ['client_id', ledger.clientId],
        ['code_verifier', oauth2.verifier]
      ),
      [form('redirect_uri', 'the redirect_uri sent to /oauth2/authorize', 'http://localhost/other')]
    ],
    [
      'a client secret that is wrong, although a public client needs none',
      exchangeWith(
        ['redirect_uri', oauth2.redirectUri],
        ['client_id', ledger.clientId],
        ['client_secret', 'nope'],
        ['code_verifier', oauth2.verifier]
      ),
      [auth('client_secret', ledger.clientSecret, 'nope')]
    ],
    [
      'a secret in the form beside a Basic header with an empty one, naming both',
      exchangeWith(
        ['redirect_uri', oauth2.redirectUri],
        ['code_verifier', oauth2.verifier],
        ['client_secret', ledger.clientSecret]
      ).header('Authorization', basic(`${ledger.clientId}:`)),
      [auth('client_secret', ledger.clientSecret, ' & test-client-secret')]
    ],
    [
      'another client id',
      exchangeWith(
        ['redirect_uri', oauth2.redirectUri],
        ['client_id', 'someone-else'],
        ['code_verifier', oauth2.verifier]
      ),
      [auth('client_id', ledger.clientId, 'someone-else')]
    ],
    [
      'a Basic header that holds the client id unencoded, shown as sent',
      oauth2.exchange(issuedCode()).header('Authorization', `Basic ${ledger.clientId}`),
      [auth('client_id', ledger.clientId, 'Basic test-client-id')]
    ]
  ] as const) {
    it(`refuses ${title}`, () => {
      const found = refusal(request);

      expect(found).to.deep.equal(differences);
    });
  }
});

describe('OAuth2Server, refreshing a token', () => {
  const rotated = (number: number) =>
    tokenOf(`ac-access-token-${number}`, `,"refresh_token":"ac-refresh-token-${number}"`);

  for (const [title, request, expected] of [
    ['a refresh token, with the next number of each', oauth2.refresh('ac-refresh-token-7'), rotated(8)],
    [
      'a declared scope, which it does not echo',
      oauth2.refresh('ac-refresh-token-1', ['scope', 'ledger:read']),
      rotated(2)
    ],
    [
      'a Basic header with an empty secret',
      oauth2
        .token(['grant_type', 'refresh_token'], ['refresh_token', 'ac-refresh-token-7'])
        .header('Authorization', basic(`${ledger.clientId}:`)),
      rotated(8)
    ],
    ['the largest number that has a successor', oauth2.refresh('ac-refresh-token-2147483646'), rotated(2147483647)]
  ] as const) {
    it(`rotates both tokens for ${title}`, () => {
      const issued = token(request);

      expect(issued).to.equal(expected);
    });
  }

  for (const refreshToken of [
    'someone-elses-token',
    'ac-refresh-token-',
    'ac-refresh-token-x',
    'ac-refresh-token-+1',
    'ac-refresh-token-2147483647',
    'ac-refresh-token-2147483648'
  ]) {
    it(`refuses the refresh token '${refreshToken}', naming the shape of one`, () => {
      const differences = refusal(oauth2.refresh(refreshToken));

      expect(differences).to.deep.equal([form('refresh_token', 'ac-refresh-token-<n>', refreshToken)]);
    });
  }

  for (const [title, request, differences] of [
    [
      'a scope the stub does not declare',
      oauth2.refresh('ac-refresh-token-1', ['scope', 'ledger:admin']),
      [form('scope', DECLARED, 'ledger:admin')]
    ],
    [
      'an unknown refresh token and an undeclared scope, naming both',
      oauth2.refresh('someone-elses-token', ['scope', 'ledger:admin']),
      [form('scope', DECLARED, 'ledger:admin'), form('refresh_token', 'ac-refresh-token-<n>', 'someone-elses-token')]
    ],
    [
      'a client secret that is wrong',
      oauth2.refresh('ac-refresh-token-1', ['client_secret', 'nope']),
      [auth('client_secret', ledger.clientSecret, 'nope')]
    ],
    [
      'another client id',
      oauth2.token(
        ['grant_type', 'refresh_token'],
        ['refresh_token', 'ac-refresh-token-1'],
        ['client_id', 'someone-else']
      ),
      [auth('client_id', ledger.clientId, 'someone-else')]
    ],
    [
      'a secret in the form beside the one in a Basic header, naming both',
      oauth2
        .refresh('ac-refresh-token-1', ['client_secret', 'nope'])
        .header('Authorization', basic(`${ledger.clientId}:${ledger.clientSecret}`)),
      [auth('client_secret', ledger.clientSecret, 'test-client-secret & nope')]
    ],
    [
      'a Basic header without a colon, shown as sent',
      oauth2.refresh('ac-refresh-token-1', ['client_secret', 'nope']).header('Authorization', basic(ledger.clientId)),
      [auth('client_id', ledger.clientId, 'Basic dGVzdC1jbGllbnQtaWQ=')]
    ],
    [
      'a Basic header that holds the client id unencoded, shown as sent',
      oauth2.refresh('ac-refresh-token-1').header('Authorization', `Basic ${ledger.clientId}`),
      [auth('client_id', ledger.clientId, 'Basic test-client-id')]
    ]
  ] as const) {
    it(`refuses ${title}`, () => {
      const found = refusal(request);

      expect(found).to.deep.equal(differences);
    });
  }
});

describe('OAuth2Server, with the password grant', () => {
  const password = (...fields: (readonly [string, string])[]) => oauth2.token(['grant_type', 'password'], ...fields);

  it('issues the password token', () => {
    const issued = token(oauth2.password());

    expect(issued).to.equal(tokenOf('pw-access-token', ',"scope":"ledger:write"'));
  });

  for (const [title, request, differences] of [
    ['another password', oauth2.password({ password: 'nope' }), [form('password', ledger.password, 'nope')]],
    [
      'no username',
      password(['password', ledger.password], ['client_id', ledger.clientId], ['client_secret', ledger.clientSecret]),
      [form('username', ledger.username, 'absent')]
    ],
    [
      'no client secret',
      password(['username', ledger.username], ['password', ledger.password], ['client_id', ledger.clientId]),
      [auth('client_secret', ledger.clientSecret, 'absent')]
    ],
    [
      'the scope parameter sent twice',
      password(
        ['username', ledger.username],
        ['password', ledger.password],
        ['client_id', ledger.clientId],
        ['client_secret', ledger.clientSecret],
        ['scope', 'ledger:read'],
        ['scope', 'ledger:write']
      ),
      [form('scope', ONE_SCOPE, 'ledger:read & ledger:write')]
    ],
    [
      'another client id',
      password(
        ['username', ledger.username],
        ['password', ledger.password],
        ['client_id', 'someone-else'],
        ['client_secret', ledger.clientSecret]
      ),
      [auth('client_id', ledger.clientId, 'someone-else')]
    ],
    [
      'a scope the stub does not declare',
      oauth2.password({ scope: 'ledger:admin' }),
      [form('scope', DECLARED, 'ledger:admin')]
    ]
  ] as const) {
    it(`refuses ${title}`, () => {
      const found = refusal(request);

      expect(found).to.deep.equal(differences);
    });
  }
});

describe('OAuth2Server, offering some flows only', () => {
  for (const [title, flows, request, expected, sent] of [
    [
      'a refresh where client credentials alone are offered',
      [clientCredentialsFlow],
      oauth2.refresh('ac-refresh-token-1'),
      'client_credentials',
      'refresh_token'
    ],
    [
      'the password grant where client credentials alone are offered',
      [clientCredentialsFlow],
      oauth2.password(),
      'client_credentials',
      'password'
    ],
    [
      'every grant where the implicit flow alone is offered, naming none',
      [implicitFlow],
      oauth2.clientCredentials(),
      'none (only the implicit flow is offered)',
      'client_credentials'
    ]
  ] as const) {
    it(`refuses ${title}`, () => {
      const differences = refusal(request, serverWith({ flows }));

      expect(differences).to.deep.equal([form('grant_type', expected, sent)]);
    });
  }

  it('leaves a request to another path to the stubs', () => {
    const verdict = answer(TestRequest.get('/v1/accounts').bearer());

    expect(verdict).to.be.undefined;
  });

  it("leaves a request to another server's token path to that server", () => {
    const verdict = answer(oauth2.partnerClientCredentials());

    expect(verdict).to.be.undefined;
  });

  it('answers the partner server at its own token path with its own token', () => {
    const partner = new OAuth2Server(sampleOAuth2('partner oauth2 server').settings);

    const issued = token(oauth2.partnerClientCredentials(), partner);

    expect(issued).to.include(`"access_token":"${ledger.partnerToken}"`);
  });
});
