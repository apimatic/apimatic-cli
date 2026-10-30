import { expect } from 'chai';
import { PortalConfig } from '../../../../src/types/portal/portal-config';
import { CopilotRegistration } from '../../../../src/types/portal/copilot/copilot-registration';

const SITE = { name: 'Acme', description: '' };

describe('CopilotRegistration', () => {
  const configAt = (url?: string) =>
    PortalConfig.fromBlock({ site: { name: 'Acme Docs', ...(url === undefined ? {} : { url }) } }, SITE)._unsafeUnwrap();

  it("tells the service the portal's name and address, and allows the site's origin", () => {
    const registration = CopilotRegistration.of(configAt('https://example.com/docs/'), [], 'live')._unsafeUnwrap();

    expect(registration.toJSON()).to.deep.equal({
      name: 'Acme Docs',
      siteUrl: 'https://example.com/docs',
      allowedOrigins: ['https://example.com']
    });
  });

  it('allows the other sites passed, as origins, once each', () => {
    const registration = CopilotRegistration.of(
      configAt('https://example.com/docs'),
      ['https://staging.example.com/', 'HTTPS://EXAMPLE.COM', ' http://localhost:3000 '],
      'live'
    )._unsafeUnwrap();

    expect(registration.origins()).to.deep.equal([
      'https://example.com',
      'https://staging.example.com',
      'http://localhost:3000'
    ]);
  });

  it('names every site that is not an origin', () => {
    const problems = CopilotRegistration.of(
      configAt('https://example.com'),
      ['https://example.com/docs', 'example.com', 'ftp://example.com', 'https://example.com?x=1', 'https://ok.test'],
      'live'
    )._unsafeUnwrapErr();

    expect(problems).to.deep.equal([
      { kind: 'invalidOrigin', value: 'https://example.com/docs' },
      { kind: 'invalidOrigin', value: 'example.com' },
      { kind: 'invalidOrigin', value: 'ftp://example.com' },
      { kind: 'invalidOrigin', value: 'https://example.com?x=1' }
    ]);
  });

  // A live key works only on the sites listed for it, so with none it would work nowhere.
  it('refuses a live key with no site to work on, but not a development one', () => {
    expect(CopilotRegistration.of(configAt(), [], 'live')._unsafeUnwrapErr()).to.deep.equal([{ kind: 'noOrigins' }]);
    expect(CopilotRegistration.of(configAt(), [], 'dev')._unsafeUnwrap().toJSON()).to.deep.equal({
      name: 'Acme Docs',
      siteUrl: null,
      allowedOrigins: []
    });
  });
});
