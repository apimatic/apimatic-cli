import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import type { Document } from 'fumadocs-openapi';
import { withAbsoluteOAuthUrls } from '../../portal-template/src/lib/openapi-oauth';
import { openApiSection } from '../../portal-template/src/lib/openapi-section.server';

const documentWith = (servers: unknown, securitySchemes: Record<string, unknown>): Document =>
  ({
    openapi: '3.0.3',
    info: { title: 'Pets', version: '1' },
    ...(servers === undefined ? {} : { servers }),
    paths: {},
    components: { securitySchemes }
  } as unknown as Document);

const schemesOf = (document: Document) =>
  (document as unknown as { components: { securitySchemes: Record<string, any> } }).components.securitySchemes;

const oauth = (flows: Record<string, unknown>) => ({ type: 'oauth2', flows });

describe('withAbsoluteOAuthUrls', () => {
  it('resolves a relative token URL against the server', () => {
    const document = documentWith([{ url: 'https://api-m.sandbox.paypal.com' }], {
      Oauth2: oauth({ clientCredentials: { tokenUrl: '/v1/oauth2/token', scopes: {} } })
    });

    expect(schemesOf(withAbsoluteOAuthUrls(document)).Oauth2.flows.clientCredentials).to.deep.equal({
      tokenUrl: 'https://api-m.sandbox.paypal.com/v1/oauth2/token',
      scopes: {}
    });
  });

  it('resolves the authorization, token and refresh URLs of every flow', () => {
    const document = documentWith([{ url: 'https://api.example.com' }], {
      Oauth2: oauth({
        authorizationCode: { authorizationUrl: '/authorize', tokenUrl: '/token', refreshUrl: '/refresh', scopes: {} },
        password: { tokenUrl: 'token', scopes: {} }
      })
    });

    const flows = schemesOf(withAbsoluteOAuthUrls(document)).Oauth2.flows;

    expect(flows.authorizationCode).to.deep.equal({
      authorizationUrl: 'https://api.example.com/authorize',
      tokenUrl: 'https://api.example.com/token',
      refreshUrl: 'https://api.example.com/refresh',
      scopes: {}
    });
    expect(flows.password.tokenUrl).to.equal('https://api.example.com/token');
  });

  it('fills in the default of each variable in the server URL', () => {
    const document = documentWith(
      [
        {
          url: 'https://{region}.example.com/{version}',
          variables: { region: { default: 'eu' }, version: { default: 'v2' } }
        }
      ],
      { Oauth2: oauth({ clientCredentials: { tokenUrl: '/oauth/token', scopes: {} } }) }
    );

    expect(schemesOf(withAbsoluteOAuthUrls(document)).Oauth2.flows.clientCredentials.tokenUrl).to.equal(
      'https://eu.example.com/oauth/token'
    );
  });

  it('leaves the document as it is when every OAuth URL is absolute', () => {
    const document = documentWith([{ url: 'https://api.example.com' }], {
      Oauth2: oauth({ clientCredentials: { tokenUrl: 'https://auth.example.com/token', scopes: {} } }),
      ApiKey: { type: 'apiKey', name: 'key', in: 'header' }
    });

    expect(withAbsoluteOAuthUrls(document)).to.equal(document);
  });

  // With no absolute server there is nothing to resolve against but the portal itself.
  it('leaves the document as it is when the server URL is not absolute', () => {
    for (const servers of [undefined, [], [{ url: '/api' }], [{ url: 'https://{tenant}.example.com' }]]) {
      const document = documentWith(servers, {
        Oauth2: oauth({ clientCredentials: { tokenUrl: '/token', scopes: {} } })
      });

      expect(withAbsoluteOAuthUrls(document)).to.equal(document);
    }
  });

  it('modifies nothing it was given', () => {
    const document = documentWith([{ url: 'https://api.example.com' }], {
      Oauth2: oauth({ clientCredentials: { tokenUrl: '/token', scopes: {} } })
    });
    const before = structuredClone(document);

    withAbsoluteOAuthUrls(document);

    expect(document).to.deep.equal(before);
  });

  it('gives the playground of a reference page the resolved token URL', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-oauth-'));
    try {
      const file = path.join(root, 'openapi.json');
      fs.writeFileSync(
        file,
        JSON.stringify({
          ...documentWith([{ url: 'https://api-m.sandbox.paypal.com' }], {
            Oauth2: oauth({ clientCredentials: { tokenUrl: '/v1/oauth2/token', scopes: {} } })
          }),
          security: [{ Oauth2: [] }],
          paths: {
            '/orders': { get: { tags: ['orders'], operationId: 'list', responses: { 200: { description: 'ok' } } } }
          }
        })
      );

      const section = await openApiSection('api', file, null);
      const page = section.files.find((entry) => entry.type === 'page')!;
      const bundled = (
        page.data as { getOpenAPIPageProps: () => { payload: { bundled: Record<string, any> } } }
      ).getOpenAPIPageProps().payload.bundled;

      expect(bundled.components.securitySchemes.Oauth2.flows.clientCredentials.tokenUrl).to.equal(
        'https://api-m.sandbox.paypal.com/v1/oauth2/token'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
