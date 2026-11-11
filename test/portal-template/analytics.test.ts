import { expect } from 'chai';
import { holdsOAuthAnswer, pageLocation, PortalEventName, PortalEvents } from '../../portal-template/src/lib/analytics';

// The lists are written out here, not imported: the test is the contract, and a name the module drops fails it.
const OAUTH_ANSWER = [
  'code',
  'state',
  'access_token',
  'id_token',
  'token_type',
  'expires_in',
  'error',
  'session_state',
  'iss'
];
const KEPT_NAMES = [
  '_gl',
  'gclid',
  'gbraid',
  'wbraid',
  'gad_source',
  'dclid',
  'fbclid',
  'msclkid',
  'ttclid',
  'twclid',
  'li_fat_id',
  'mc_cid',
  '_hsenc',
  '_hsmi',
  'ref'
];

describe('pageLocation', () => {
  const page = 'https://docs.test/guides/quickstart';

  it('drops the query and the # part', () => {
    expect(pageLocation(`${page}?tab=python&page=2#install`, [])).to.equal(page);
    expect(pageLocation(`${page}#install`, [])).to.equal(page);
  });

  it('keeps campaign tags', () => {
    expect(pageLocation(`${page}?utm_source=newsletter&utm_medium=email&session=abc`, [])).to.equal(
      `${page}?utm_source=newsletter&utm_medium=email`
    );
  });

  it('keeps HubSpot ad tags', () => {
    expect(pageLocation(`${page}?hsa_acc=1&hsa_cam=2&session=abc`, [])).to.equal(`${page}?hsa_acc=1&hsa_cam=2`);
  });

  it('keeps each ad-click and cross-domain tag', () => {
    for (const name of KEPT_NAMES) {
      expect(pageLocation(`${page}?${name}=x&session=abc`, []), name).to.equal(`${page}?${name}=x`);
    }
  });

  it("keeps the customer's own names", () => {
    expect(pageLocation(`${page}?campaign_id=7&session=abc`, ['campaign_id'])).to.equal(`${page}?campaign_id=7`);
  });

  it('drops a name that only starts with a kept one', () => {
    expect(pageLocation(`${page}?gclidx=1`, [])).to.equal(page);
  });

  it('is null on the OAuth callback', () => {
    expect(pageLocation('https://docs.test/oauth/callback?code=abc&state=123', [])).to.be.null;
    expect(pageLocation('https://docs.test/oauth/callback#access_token=xyz&state=123', [])).to.be.null;
  });

  it('is null on the OAuth callback under a base path', () => {
    expect(pageLocation('https://docs.test/docs/oauth/callback?code=abc&state=123', [], '/docs/')).to.be.null;
  });

  // A static host may answer `/oauth/callback` at `/oauth/callback/` and keep the query.
  it('is null on the OAuth callback with a trailing slash', () => {
    expect(pageLocation('https://docs.test/oauth/callback/?code=abc&state=123', [])).to.be.null;
    expect(pageLocation('https://docs.test/docs/oauth/callback/#access_token=xyz', [], '/docs/')).to.be.null;
  });

  it('is not the callback at the root when the portal is under a base path', () => {
    expect(pageLocation('https://docs.test/oauth/callback', [], '/docs/')).to.equal('https://docs.test/oauth/callback');
  });

  it('leaves the address otherwise unchanged', () => {
    expect(pageLocation(page, [])).to.equal(page);
    expect(pageLocation('https://docs.test/', [])).to.equal('https://docs.test/');
    expect(pageLocation('https://docs.test/docs/api/pets/Get%20Pets', [], '/docs/')).to.equal(
      'https://docs.test/docs/api/pets/Get%20Pets'
    );
    expect(pageLocation('http://localhost:3000/guides/quickstart', [])).to.equal(
      'http://localhost:3000/guides/quickstart'
    );
  });
});

describe('holdsOAuthAnswer', () => {
  const page = 'https://docs.test/api/pets/listPets';

  it('is true for each OAuth answer name on its own, in the query', () => {
    for (const name of OAUTH_ANSWER) {
      expect(holdsOAuthAnswer(`${page}?${name}=x`), name).to.be.true;
    }
  });

  it('is true for each OAuth answer name on its own, after the #', () => {
    for (const name of OAUTH_ANSWER) {
      expect(holdsOAuthAnswer(`${page}#${name}=x`), name).to.be.true;
    }
  });

  it('is true with the answer beside other parameters', () => {
    expect(holdsOAuthAnswer(`${page}?utm_source=newsletter&code=abc&state=123`)).to.be.true;
    expect(holdsOAuthAnswer(`${page}?tab=python#access_token=xyz&state=123`)).to.be.true;
  });

  it("is false for a campaign tag or a name of the customer's own", () => {
    expect(holdsOAuthAnswer(`${page}?utm_source=newsletter`)).to.be.false;
    expect(holdsOAuthAnswer(`${page}?campaign_id=7`)).to.be.false;
    expect(holdsOAuthAnswer(`${page}#campaign_id=7`)).to.be.false;
  });

  it('is false for a clean address', () => {
    expect(holdsOAuthAnswer(page)).to.be.false;
    expect(holdsOAuthAnswer(`${page}#install`)).to.be.false;
  });
});

describe('PortalEvents', () => {
  // The compiler holds this table to the interface: a missing event, a missing key or an extra key does not compile.
  const events: { [E in PortalEventName]: Record<keyof PortalEvents[E], true> } = {
    docs_page_view: { page_title: true }
  };

  it('names every event docs_ plus lowercase snake_case, at most 40 characters', () => {
    for (const name of Object.keys(events)) {
      expect(name).to.match(/^docs_[a-z0-9_]+$/);
      expect(name.length, name).to.be.at.most(40);
    }
  });

  // GA4 takes at most 25 parameters per event, and report() adds page_location to each.
  it('gives every event at most 24 keys, so 25 with page_location', () => {
    for (const [name, keys] of Object.entries(events)) {
      expect(Object.keys(keys).length, name).to.be.at.most(24);
    }
  });
});
