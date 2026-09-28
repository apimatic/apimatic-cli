import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { expect } from 'chai';
import { oauthClientAuth, withBasicClientAuth } from '../../portal-template/oauth-client-auth';

// The client credentials request as fumadocs-openapi 11.4.1 writes it, in a function to call.
const fumadocsRequest = `async (fetch, values, scopes) => {
	await fetch("https://auth.example.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "client_credentials",
			client_id: values.clientId,
			client_secret: values.clientSecret,
			scope: scopes.join("+")
		})
	});
}`;

interface Sent {
  headers: Record<string, string>;
  body: URLSearchParams;
}

/** What the rewritten request sends for these credentials and scopes. */
const sent = async (scopes: string[]): Promise<Sent> => {
  const request = new Function(`return ${withBasicClientAuth(fumadocsRequest)}`)();
  let captured: Sent | undefined;
  await request(
    (_url: string, init: Sent) => {
      captured = init;
    },
    { clientId: 'id', clientSecret: 'secret' },
    scopes
  );
  return captured!;
};

describe('oauthClientAuth', () => {
  it('sends the client credentials in a Basic Authorization header', async () => {
    const { headers, body } = await sent(['read']);

    expect(headers.Authorization).to.equal(`Basic ${Buffer.from('id:secret').toString('base64')}`);
    expect([...body.keys()]).to.deep.equal(['grant_type', 'scope']);
    expect(body.get('grant_type')).to.equal('client_credentials');
  });

  it('leaves out a scope when the operation asks for none', async () => {
    const { body } = await sent([]);

    expect(body.has('scope')).to.equal(false);
  });

  it('rewrites the dialog of the fumadocs-openapi the portal is built with', () => {
    const require = createRequire(import.meta.url);
    const dist = path.dirname(require.resolve('fumadocs-openapi/playground/client'));
    const file = path.join(dist, 'components', 'oauth-dialog.js');
    const transform = oauthClientAuth().transform as (code: string, id: string) => string | undefined;

    const rewritten = transform(fs.readFileSync(file, 'utf8'), file.replaceAll('\\', '/'));

    expect(rewritten).to.include('Authorization: `Basic ${btoa(');
    expect(rewritten).to.not.match(/grant_type: "client_credentials",\s*client_id/);
  });

  it('leaves every other module alone', () => {
    const transform = oauthClientAuth().transform as (code: string, id: string) => string | undefined;

    expect(transform(fumadocsRequest, '/node_modules/fumadocs-openapi/dist/playground/client.js')).to.equal(undefined);
  });

  it('fails the build when fumadocs changes the request', () => {
    expect(() => withBasicClientAuth('fetch(value.tokenUrl, {})')).to.throw('update oauth-client-auth.ts');
  });
});
