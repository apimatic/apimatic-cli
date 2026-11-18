import { expect } from 'chai';
import sinon from 'sinon';
import { Analytics, pageLocation, PortalEventName, PortalEvents } from '../../portal-template/src/lib/analytics';
import type { PortalEvent } from '../../portal-template/src/lib/event-feed';
import type { PortalAnalytics, PortalScript } from '../../portal-template/src/lib/portal-types';
import { Adapter, adapters } from '../../portal-template/src/lib/vendor-tags';

// The list is written out here, not imported: the test is the contract, and a name the module drops fails it.
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
  '_hsmi'
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

  // No platform reads it from the address, and a customer can add a name but cannot take one out.
  it('drops ref, which sites use for codes of their own, unless the customer keeps it', () => {
    expect(pageLocation(`${page}?ref=invite-4821`, [])).to.equal(page);
    expect(pageLocation(`${page}?ref=newsletter`, ['ref'])).to.equal(`${page}?ref=newsletter`);
  });

  it('leaves the address otherwise unchanged', () => {
    expect(pageLocation(page, [])).to.equal(page);
    expect(pageLocation('https://docs.test/', [])).to.equal('https://docs.test/');
    expect(pageLocation('https://docs.test/docs/api/pets/Get%20Pets', [])).to.equal(
      'https://docs.test/docs/api/pets/Get%20Pets'
    );
    expect(pageLocation('http://localhost:3000/guides/quickstart', [])).to.equal(
      'http://localhost:3000/guides/quickstart'
    );
  });
});

describe('PortalEvents', () => {
  // The compiler holds this table to the interface: a missing event, a missing key, or an extra key on an event with
  // keys does not compile; an event with no keys takes none at report().
  const events: { [E in PortalEventName]: Record<keyof PortalEvents[E], true> } = {
    docs_page_view: { page_title: true },
    docs_markdown_copy: {},
    docs_plugin_install: {},
    docs_sdk_download: { sdk_language: true },
    docs_code_copy: { code_language: true },
    docs_search: { search_term: true, picked_result: true, result_count: true },
    docs_not_found: { page_referrer: true },
    docs_api_request: { endpoint: true, status: true, duration_ms: true }
  };

  // Customers build GTM triggers and GA4 reports on these. They are plain text here, apart from the interface, so
  // a rename or a new key is a change made in this list on purpose, never the side effect of a refactor.
  it('ships exactly these events, each with exactly these keys', () => {
    expect(Object.entries(events).map(([name, keys]) => [name, Object.keys(keys)])).to.deep.equal([
      ['docs_page_view', ['page_title']],
      ['docs_markdown_copy', []],
      ['docs_plugin_install', []],
      ['docs_sdk_download', ['sdk_language']],
      ['docs_code_copy', ['code_language']],
      ['docs_search', ['search_term', 'picked_result', 'result_count']],
      ['docs_not_found', ['page_referrer']],
      ['docs_api_request', ['endpoint', 'status', 'duration_ms']]
    ]);
  });

  // gtag takes `language` on an event for the reader's own, so GA4's Language report would list `python`.
  it('names no key `language`', () => {
    expect(Object.values(events).flatMap((keys) => Object.keys(keys))).to.not.include('language');
  });

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

interface FakeScript {
  async: boolean;
  src: string;
  textContent: string;
}

interface FakeWindow {
  location: URL & { reload: () => void };
  dataLayer?: unknown[];
  gtag?: (...command: unknown[]) => void;
  /** As a script in the page sees it; `consent` stands for a key of someone else's. */
  apimatic?: { analytics: { subscribe(callback: (event: PortalEvent) => void): () => void }; consent?: string };
}

/** A page in the browser: the `window` and `document` the module reads, and the scripts the loader appends. */
function browser(href: string, title = 'Quickstart | Acme API', referrer = '') {
  const scripts: FakeScript[] = [];
  /** The address of each script the host put in the head itself, before the portal's bundle ran. */
  const fromHost: string[] = [];
  let reloads = 0;
  const window: FakeWindow = { location: Object.assign(new URL(href), { reload: () => (reloads += 1) }) };
  const document = {
    title,
    referrer,
    createElement: (): FakeScript => ({ async: false, src: '', textContent: '' }),
    head: {
      append: (script: FakeScript) => scripts.push(script),
      querySelectorAll: () => fromHost.map((src) => ({ getAttribute: () => src }))
    }
  };
  Object.assign(globalThis, { window, document });
  return {
    window,
    head: document.head,
    scripts,
    fromHost,
    dataLayer: () => window.dataLayer ?? [],
    reloads: () => reloads,
    go: (next: string, nextTitle = title) => {
      window.location.href = next;
      document.title = nextTitle;
    }
  };
}

const isArguments = (entry: unknown) => Object.prototype.toString.call(entry) === '[object Arguments]';
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !isArguments(value);
const gtagCalls = (entries: unknown[]) =>
  entries.filter(isArguments).map((entry) => Array.from(entry as ArrayLike<unknown>));
const pageViews = (entries: unknown[]) =>
  entries.filter((entry) => isPlainObject(entry) && entry.event === 'docs_page_view');
/** What the data layer reads as, once GTM has merged every push: objects recursively, `null` replacing. */
function mergedLikeGtm(entries: unknown[]): Record<string, unknown> {
  const merge = (into: Record<string, unknown>, from: Record<string, unknown>): Record<string, unknown> => {
    for (const [key, value] of Object.entries(from)) {
      const current = into[key];
      into[key] = isPlainObject(value) && isPlainObject(current) ? merge({ ...current }, value) : value;
    }
    return into;
  };
  return entries.filter(isPlainObject).reduce(merge, {});
}

const none: PortalAnalytics = {
  googleTagManager: null,
  googleAnalytics: null,
  googleConsentMode: null,
  keepQueryParams: [],
  eventFeed: 'on'
};
const withGtm = (environment: { auth: string; preview: string } | null = null): PortalAnalytics => ({
  ...none,
  googleTagManager: { containerId: 'GTM-ABC123', environment }
});
const withGa4: PortalAnalytics = { ...none, googleAnalytics: { measurementId: 'G-ABC123' } };
const withBoth: PortalAnalytics = {
  ...none,
  googleTagManager: withGtm().googleTagManager,
  googleAnalytics: withGa4.googleAnalytics
};
const GTM_SCRIPT = 'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123';
const GA4_SCRIPT = 'https://www.googletagmanager.com/gtag/js?id=G-ABC123';

describe('Analytics', () => {
  const quickstart = 'https://docs.test/guides/quickstart';
  const quickstartView = {
    event: 'docs_page_view',
    docs: { page_title: 'Quickstart | Acme API', page_location: quickstart }
  };
  const global = globalThis as { window?: unknown; document?: unknown };

  afterEach(() => {
    delete global.window;
    delete global.document;
  });

  describe('with neither vendor set', () => {
    it('pushes a reset entry and one clean page view entry, and nothing else', () => {
      const page = browser(`${quickstart}?utm_source=newsletter&tab=python#install`);
      const analytics = new Analytics(none, []);

      analytics.start();
      analytics.reportPageView();

      expect(page.dataLayer()).to.deep.equal([
        { docs: null },
        {
          event: 'docs_page_view',
          docs: { page_title: 'Quickstart | Acme API', page_location: `${quickstart}?utm_source=newsletter` }
        }
      ]);
      expect(page.window.gtag).to.be.undefined;
      expect(page.scripts).to.be.empty;
    });

    it('writes to a data layer the page already has', () => {
      const page = browser(quickstart);
      const existing = { 'host-tag': true };
      page.window.dataLayer = [existing];
      const analytics = new Analytics(none, []);

      analytics.start();
      analytics.reportPageView();

      expect(page.dataLayer()).to.deep.equal([existing, { docs: null }, quickstartView]);
    });
  });

  describe('with Google Tag Manager', () => {
    it('pushes the gtm.start entry first, inserts gtm.js, then pushes the page view', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(withGtm(), []);

      analytics.start();
      analytics.reportPageView();

      const [start, reset, view, ...rest] = page.dataLayer();
      expect(start).to.have.property('event', 'gtm.js');
      expect(start).to.have.property('gtm.start').that.is.a('number');
      expect(reset).to.deep.equal({ docs: null });
      expect(view).to.deep.equal(quickstartView);
      expect(rest).to.be.empty;
      expect(page.scripts.map((script) => script.src)).to.deep.equal([GTM_SCRIPT]);
      expect(page.scripts[0].async).to.be.true;
      expect(page.window.gtag).to.be.undefined;
    });

    it("escapes the container's ID and the environment's values in the tag's address", () => {
      const page = browser(quickstart);
      const setting = { containerId: 'GTM-A&B', environment: { auth: 'a&b', preview: 'env 3' } };

      new Analytics({ ...none, googleTagManager: setting }, []).start();

      expect(page.scripts.map((script) => script.src)).to.deep.equal([
        'https://www.googletagmanager.com/gtm.js?id=GTM-A%26B&gtm_auth=a%26b&gtm_preview=env%203&gtm_cookies_win=x'
      ]);
    });

    it("loads the container's environment when one is set", () => {
      const page = browser(quickstart);

      new Analytics(withGtm({ auth: 'abc123', preview: 'env-3' }), []).start();

      expect(page.scripts.map((script) => script.src)).to.deep.equal([
        `${GTM_SCRIPT}&gtm_auth=abc123&gtm_preview=env-3&gtm_cookies_win=x`
      ]);
    });
  });

  describe('with Google Analytics', () => {
    it('pushes js and config with its own page view off, and inserts gtag.js', () => {
      const page = browser(quickstart);

      new Analytics(withGa4, []).start();

      const [js, config, ...rest] = gtagCalls(page.dataLayer());
      expect(js[0]).to.equal('js');
      expect(js[1]).to.be.an.instanceOf(Date);
      expect(config).to.deep.equal(['config', 'G-ABC123', { send_page_view: false }]);
      expect(rest).to.be.empty;
      expect(page.scripts.map((script) => script.src)).to.deep.equal([GA4_SCRIPT]);
      expect(page.window.gtag).to.be.a('function');
    });

    it('sends each page view as page_view, without the prefix, after the reset and event entries', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(withGa4, []);

      analytics.start();
      analytics.reportPageView();

      const entries = page.dataLayer();
      expect(entries).to.have.length(6);
      expect(entries[2]).to.deep.equal({ docs: null });
      expect(entries[3]).to.deep.equal(quickstartView);
      expect(gtagCalls(entries.slice(4))).to.deep.equal([
        ['set', { page_location: quickstart }],
        ['event', 'page_view', quickstartView.docs]
      ]);
    });

    it("gives GA4's own events the reported address of each page, never the one in the address bar", () => {
      const page = browser('https://docs.test/api/pets/listPets?code=x&state=y#access_token=z', 'List pets');
      const analytics = new Analytics(withGa4, []);

      analytics.start();
      analytics.reportPageView();
      page.go(`${quickstart}?utm_source=mail&tab=python#install`);
      analytics.reportPageView();
      analytics.report('docs_markdown_copy', {});

      expect(gtagCalls(page.dataLayer()).filter((command) => command[0] === 'set')).to.deep.equal([
        ['set', { page_location: 'https://docs.test/api/pets/listPets' }],
        ['set', { page_location: `${quickstart}?utm_source=mail` }]
      ]);
    });

    it('pushes Arguments objects, which gtag.js reads, never arrays of the same values', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(withGa4, []);

      analytics.start();
      analytics.reportPageView();

      expect(page.dataLayer().filter(isArguments)).to.have.length(4);
      expect(page.dataLayer().some(Array.isArray)).to.be.false;
    });

    it("escapes the measurement ID in the tag's address", () => {
      const page = browser(quickstart);

      new Analytics({ ...none, googleAnalytics: { measurementId: 'G-A#B' } }, []).start();

      expect(page.scripts.map((script) => script.src)).to.deep.equal([
        'https://www.googletagmanager.com/gtag/js?id=G-A%23B'
      ]);
    });

    it('uses a gtag the page already defines, rather than replacing it', () => {
      const page = browser(quickstart);
      const calls: unknown[][] = [];
      const existing = (...command: unknown[]) => {
        calls.push(command);
      };
      page.window.gtag = existing;
      const analytics = new Analytics(withGa4, []);

      analytics.start();
      analytics.reportPageView();

      expect(page.window.gtag).to.equal(existing);
      expect(calls.map((command) => command[0])).to.deep.equal(['js', 'config', 'set', 'event']);
      expect(page.dataLayer().filter(isArguments)).to.be.empty;
    });

    // The browser answers `window.gtag` with an element whose id is `gtag`, which a heading by that name gets.
    it('makes a gtag of its own where the window answers that name with an element, as for a heading', () => {
      const page = browser(quickstart);
      Object.assign(page.window, { gtag: { id: 'gtag' } });
      const analytics = new Analytics(withGa4, []);

      analytics.start();
      analytics.reportPageView();

      expect(page.window.gtag).to.be.a('function');
      expect(gtagCalls(page.dataLayer()).map((command) => command[0])).to.deep.equal(['js', 'config', 'set', 'event']);
    });

    // An instance that ran no setup, as one whose start asked for a reload, finds the element still there.
    it('sends nothing, and throws nothing, through an element by that name', () => {
      const page = browser(quickstart);
      Object.assign(page.window, { gtag: { id: 'gtag' } });

      expect(() => new Analytics(withGa4, []).report('docs_markdown_copy', {})).to.not.throw();
      expect(page.dataLayer().filter(isArguments)).to.be.empty;
    });

    it("sends through the window's gtag from a second instance, as a config save under portal serve makes", () => {
      const page = browser(quickstart);
      new Analytics(withGa4, []).start();
      const second = new Analytics(withGa4, []);
      second.start();

      second.report('docs_markdown_copy', {});

      expect(gtagCalls(page.dataLayer()).map((command) => command[0])).to.deep.equal(['js', 'config', 'event']);
    });
  });

  describe('with both vendors', () => {
    it('pushes every setup entry once, gtm.start first, before the first event', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(withBoth, []);

      analytics.start();
      analytics.reportPageView();

      const entries = page.dataLayer();
      expect(entries).to.have.length(7);
      expect(entries[0]).to.have.property('event', 'gtm.js');
      expect(gtagCalls(entries.slice(1, 3)).map((command) => command[0])).to.deep.equal(['js', 'config']);
      expect(entries[3]).to.deep.equal({ docs: null });
      expect(entries[4]).to.deep.equal(quickstartView);
      expect(gtagCalls(entries.slice(5)).map((command) => command[0])).to.deep.equal(['set', 'event']);
      expect(gtagCalls([entries[6]])[0]).to.deep.equal(['event', 'page_view', quickstartView.docs]);
      expect(page.scripts.map((script) => script.src)).to.deep.equal([GTM_SCRIPT, GA4_SCRIPT]);
    });

    it('starts once per window, for a second start and for a second instance alike', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(withBoth, []);

      analytics.start();
      analytics.start();
      new Analytics(withBoth, []).start();

      expect(page.dataLayer()).to.have.length(3);
      expect(page.scripts).to.have.length(2);
      expect(page.reloads()).to.equal(0);
    });

    it('reloads the page for a start with other vendors, as a config save under portal serve makes', () => {
      const page = browser(quickstart);
      new Analytics(withGtm(), []).start();

      new Analytics(withBoth, []).start();

      expect(page.reloads()).to.equal(1);
      expect(page.dataLayer()).to.have.length(1);
      expect(page.scripts.map((script) => script.src)).to.deep.equal([GTM_SCRIPT]);
    });
  });

  describe('with Google Consent Mode set', () => {
    const denied: PortalAnalytics['googleConsentMode'] = { default: 'denied' };
    const defaults = [
      'consent',
      'default',
      {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
        wait_for_update: 500
      }
    ];
    const consentCommands = (entries: unknown[]) => gtagCalls(entries).filter((command) => command[0] === 'consent');

    // Google takes a reader's answer from what is queued before its first event, so this has to lead the data layer.
    it('queues the defaults first, ahead of both setups, as an Arguments object with four types denied and a wait', () => {
      const page = browser(quickstart);

      new Analytics({ ...withBoth, googleConsentMode: denied }, []).start();

      const entries = page.dataLayer();
      expect(isArguments(entries[0])).to.be.true;
      expect(gtagCalls([entries[0]])[0]).to.deep.equal(defaults);
      expect(entries[1]).to.have.property('event', 'gtm.js');
      expect(gtagCalls(entries.slice(2)).map((command) => command[0])).to.deep.equal(['js', 'config']);
      expect(page.scripts.map((script) => script.src)).to.deep.equal([GTM_SCRIPT, GA4_SCRIPT]);
    });

    it('queues them once per window, for a second start and for a second instance alike', () => {
      const page = browser(quickstart);
      const settings = { ...withGa4, googleConsentMode: denied };
      const analytics = new Analytics(settings, []);

      analytics.start();
      analytics.start();
      new Analytics(settings, []).start();

      expect(consentCommands(page.dataLayer())).to.have.length(1);
    });

    // A container reads the same Arguments entries, and a consent tool calls the window's gtag to hand over an answer.
    it('queues them on a portal with Google Tag Manager alone, through a gtag it gives the page', () => {
      const page = browser(quickstart);

      new Analytics({ ...withGtm(), googleConsentMode: denied }, []).start();

      const entries = page.dataLayer();
      expect(gtagCalls([entries[0]])[0]).to.deep.equal(defaults);
      expect(entries[1]).to.have.property('event', 'gtm.js');
      expect(page.window.gtag).to.be.a('function');
    });

    it('queues them through a gtag the page already defines', () => {
      const page = browser(quickstart);
      const calls: unknown[][] = [];
      page.window.gtag = (...command: unknown[]) => {
        calls.push(command);
      };

      new Analytics({ ...withGa4, googleConsentMode: denied }, []).start();

      expect(calls[0]).to.deep.equal(defaults);
      expect(calls.map((command) => command[0])).to.deep.equal(['consent', 'js', 'config']);
    });

    // With the setting alone, a page whose heading is called gtag used to stop the bundle on every fresh load.
    it('queues them through a gtag of its own where the window answers that name with an element', () => {
      const page = browser(quickstart);
      Object.assign(page.window, { gtag: { id: 'gtag' } });

      new Analytics({ ...none, googleConsentMode: denied }, []).start();

      expect(gtagCalls(page.dataLayer())).to.deep.equal([defaults]);
      expect(page.window.gtag).to.be.a('function');
    });

    // For a Google snippet the customer lists in portal.scripts themselves.
    it('queues them with neither vendor set', () => {
      const page = browser(quickstart);

      new Analytics({ ...none, googleConsentMode: denied }, []).start();

      expect(gtagCalls(page.dataLayer())).to.deep.equal([defaults]);
    });

    it('queues them at a start on the OAuth callback, where no tag loads', () => {
      const page = browser('https://docs.test/oauth/callback?code=abc&state=123');

      new Analytics({ ...withGa4, googleConsentMode: denied }, []).start();

      expect(gtagCalls(page.dataLayer()).map((command) => command[0])).to.deep.equal(['consent', 'js', 'config']);
      expect(page.scripts).to.be.empty;
    });

    it('reloads the page for a start with the setting added, as a config save under portal serve makes', () => {
      const page = browser(quickstart);
      new Analytics(withGa4, []).start();

      new Analytics({ ...withGa4, googleConsentMode: denied }, []).start();

      expect(page.reloads()).to.equal(1);
      expect(consentCommands(page.dataLayer())).to.be.empty;
    });
  });

  describe('with scripts listed in portal.scripts', () => {
    const SETUP = 'https://cdn.example.com/setup.js';
    const WIDGET = 'https://cdn.example.com/widget.js';
    const listed: PortalScript[] = [{ src: SETUP }, { src: WIDGET }];

    it('inserts each after the vendor tags, in the order listed, and not async, so they run in that order', () => {
      const page = browser(quickstart);

      new Analytics(withBoth, listed).start();

      expect(page.scripts.map(({ src, async }) => [src, async])).to.deep.equal([
        [GTM_SCRIPT, true],
        [GA4_SCRIPT, true],
        [SETUP, false],
        [WIDGET, false]
      ]);
    });

    it('inserts them on a portal with neither vendor set', () => {
      const page = browser(quickstart);

      new Analytics(none, listed).start();

      expect(page.scripts.map((script) => script.src)).to.deep.equal([SETUP, WIDGET]);
    });

    // At the root here; a portal hosted under a path puts that path before the file's.
    it("inserts a file of the portal's own by its path from the root, and an address as it is", () => {
      const page = browser(quickstart);

      new Analytics(none, [{ src: '/js/widget.js' }, { src: WIDGET }]).start();

      expect(page.scripts.map((script) => script.src)).to.deep.equal(['/js/widget.js', WIDGET]);
    });

    // A host, a snippet injector at its CDN or a proxy may add one of the same scripts to every page itself.
    it('inserts no second copy of a tag or a listed script the host already put in the head', () => {
      const page = browser(quickstart);
      page.fromHost.push(GTM_SCRIPT, WIDGET);
      const analytics = new Analytics(withGtm(), listed);

      analytics.start();
      analytics.reportPageView();

      expect(page.scripts.map((script) => script.src)).to.deep.equal([SETUP]);
    });

    it('inserts each once: across page views, for a second instance, and for an address listed twice', () => {
      const page = browser(quickstart);
      const twice = [...listed, { src: SETUP }];
      const analytics = new Analytics(withGtm(), twice);

      analytics.start();
      analytics.reportPageView();
      page.go('https://docs.test/guides/errors', 'Errors | Acme API');
      analytics.reportPageView();
      new Analytics(withGtm(), twice).start();

      expect(page.scripts.map((script) => script.src)).to.deep.equal([GTM_SCRIPT, SETUP, WIDGET]);
      expect(page.reloads()).to.equal(0);
    });

    // A vendor's loader may remove its own element once it has run, so the head is no record of what was inserted.
    it('inserts none again once its element has left the page, on a new page or for a second instance', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(withGtm(), listed);
      analytics.start();
      page.scripts.length = 0;

      analytics.reportPageView();
      page.go('https://docs.test/guides/errors', 'Errors | Acme API');
      analytics.reportPageView();
      new Analytics(withGtm(), listed).start();

      expect(page.scripts).to.be.empty;
    });

    // A listed script reads the address as a vendor tag does, so it stays off the OAuth callback with them.
    it('holds them back with the tags on the OAuth callback, and inserts all on the next page', () => {
      const page = browser('https://docs.test/oauth/callback?code=abc&state=123');
      const analytics = new Analytics(withGtm(), listed);

      analytics.start();
      analytics.reportPageView();

      expect(page.scripts).to.be.empty;

      page.go(quickstart);
      analytics.reportPageView();

      expect(page.scripts.map((script) => script.src)).to.deep.equal([GTM_SCRIPT, SETUP, WIDGET]);
    });

    // A sign-in's answer reaches the playground through the tab's session, so the page it returns to holds none back.
    it('inserts them at once on a page whose own link carries a state parameter', () => {
      const page = browser(`${quickstart}?state=CA`);

      new Analytics(withGtm(), listed).start();

      expect(page.scripts.map((script) => script.src)).to.deep.equal([GTM_SCRIPT, SETUP, WIDGET]);
    });

    for (const [change, next] of [
      ['one more script', [...listed, { src: 'https://cdn.example.com/chat.js' }]],
      ['one script fewer', [{ src: SETUP }]],
      ['the same scripts in another order', [{ src: WIDGET }, { src: SETUP }]]
    ] as const) {
      it(`reloads the page for a start with ${change}, as a config save under portal serve makes`, () => {
        const page = browser(quickstart);
        new Analytics(none, listed).start();

        new Analytics(none, [...next]).start();

        expect(page.reloads()).to.equal(1);
        expect(page.scripts.map((script) => script.src)).to.deep.equal([SETUP, WIDGET]);
      });
    }
  });

  describe('for a script that subscribes through window.apimatic.analytics', () => {
    /** Events from before a subscription arrive on a microtask, once `subscribe()` has returned. */
    const settled = () => Promise.resolve();
    const subscribe = (page: ReturnType<typeof browser>) => {
      const events: PortalEvent[] = [];
      page.window.apimatic?.analytics.subscribe((event) => events.push(event));
      return events;
    };

    it('is in place before the first tag or script is inserted, and on a portal with no vendor and no script too', () => {
      const page = browser(quickstart);
      const append = page.head.append;
      const atEachInsert: string[] = [];
      page.head.append = (script) => {
        atEachInsert.push(typeof page.window.apimatic?.analytics.subscribe);
        return append(script);
      };

      new Analytics(withGtm(), [{ src: 'https://cdn.example.com/widget.js' }]).start();

      expect(atEachInsert).to.deep.equal(['function', 'function']);

      const bare = browser(quickstart);
      new Analytics(none, []).start();

      expect(bare.window.apimatic?.analytics.subscribe).to.be.a('function');
    });

    // What is there is what customers build on, so it is `subscribe` and nothing a script could publish or rewrite with.
    it('gives scripts subscribe alone, on an object they cannot change', () => {
      const page = browser(quickstart);

      new Analytics(none, []).start();

      const given = page.window.apimatic?.analytics;
      expect(Object.keys(given ?? {})).to.deep.equal(['subscribe']);
      expect(Object.isFrozen(given)).to.be.true;
    });

    // A global by a name is one a script finds and builds on; the feed could also publish, or be replaced, through it.
    it('adds no name to the window but apimatic and the data layer', () => {
      const page = browser(quickstart);
      const before = Object.keys(page.window);

      new Analytics(none, []).start();

      expect(Object.keys(page.window)).to.deep.equal([...before, 'dataLayer', 'apimatic']);
    });

    it('hands over events to a subscribe a script took off the object and called on its own', async () => {
      const page = browser(quickstart);
      const analytics = new Analytics(none, []);
      analytics.start();
      const events: PortalEvent[] = [];

      const { subscribe } = page.window.apimatic?.analytics ?? { subscribe: () => () => undefined };
      subscribe((event) => events.push(event));
      analytics.report('docs_markdown_copy', {});
      await settled();

      expect(events.map((event) => event.name)).to.deep.equal(['docs_markdown_copy']);
    });

    // A page's own script may have put a stand-in there first; reporting must not come to depend on it.
    it('puts its own in place of one a page set first, keeps what else the page put beside it, and goes on reporting', async () => {
      const page = browser(quickstart);
      const standIn = { subscribe: () => () => undefined };
      page.window.apimatic = { analytics: standIn, consent: 'the page set this' };
      const analytics = new Analytics(none, []);

      analytics.start();
      const events = subscribe(page);
      analytics.reportPageView();
      await settled();

      expect(page.window.apimatic?.analytics).to.not.equal(standIn);
      expect(page.window.apimatic?.consent).to.equal('the page set this');
      expect(events.map((event) => event.name)).to.deep.equal(['docs_page_view']);
      expect(pageViews(page.dataLayer())).to.have.length(1);
    });

    // The start runs while the bundle loads, so an error thrown there leaves every page without its scripts.
    it('starts and reports where a page made window.apimatic read-only, and shows the error later', () => {
      const clock = sinon.useFakeTimers({ toFake: ['setTimeout'] });
      try {
        const page = browser(quickstart);
        const locked = { consent: 'the host locked this' };
        Object.defineProperty(page.window, 'apimatic', { value: locked, writable: false });
        const analytics = new Analytics(withGtm(), [{ src: 'https://cdn.example.com/widget.js' }]);

        analytics.start();
        analytics.reportPageView();

        expect(page.window.apimatic).to.equal(locked);
        expect(page.scripts.map((script) => script.src)).to.deep.equal([
          GTM_SCRIPT,
          'https://cdn.example.com/widget.js'
        ]);
        expect(pageViews(page.dataLayer())).to.have.length(1);
        expect(() => clock.next()).to.throw(TypeError, 'apimatic');
      } finally {
        clock.restore();
      }
    });

    it('hands over every event so far and then each new one, each with its own keys and the cleaned address', async () => {
      const page = browser(`${quickstart}?utm_source=newsletter&tab=python#install`);
      const analytics = new Analytics(withGa4, []);
      analytics.start();
      analytics.reportPageView();

      const events = subscribe(page);
      await settled();
      analytics.report('docs_code_copy', { code_language: 'python' });

      expect(events.map(({ name, params }) => [name, params])).to.deep.equal([
        [
          'docs_page_view',
          { page_title: 'Quickstart | Acme API', page_location: `${quickstart}?utm_source=newsletter` }
        ],
        ['docs_code_copy', { code_language: 'python', page_location: `${quickstart}?utm_source=newsletter` }]
      ]);
    });

    // GTM writes to the entries it is handed, so a subscriber gets a frozen copy and the data layer keeps its own.
    it('freezes what a subscriber gets, and leaves the entry in the data layer as it was', async () => {
      const page = browser(quickstart);
      const analytics = new Analytics(none, []);
      analytics.start();
      analytics.report('docs_code_copy', { code_language: 'python' });

      const events = subscribe(page);
      await settled();

      const pushed = page.dataLayer().filter(isPlainObject)[1];
      expect(Object.isFrozen(events[0]) && Object.isFrozen(events[0].params)).to.be.true;
      expect(pushed.docs).to.deep.equal(events[0].params);
      expect(pushed.docs).to.not.equal(events[0].params);
      expect(Object.isFrozen(pushed.docs)).to.be.false;
    });

    it('hands over nothing for a report made on the OAuth callback', async () => {
      const page = browser('https://docs.test/oauth/callback?code=abc&state=123');
      const analytics = new Analytics(none, []);
      analytics.start();
      const events = subscribe(page);

      analytics.reportPageView();
      analytics.report('docs_markdown_copy', {});
      await settled();

      expect(events).to.be.empty;
    });

    // A staging build keeps its `necessary` and `functional` scripts, which call subscribe() as on any build.
    it('hands a subscriber nothing in a --no-analytics build, with subscribe in place and the data layer as ever', async () => {
      const page = browser(quickstart);
      const analytics = new Analytics({ ...none, eventFeed: 'off' }, []);
      analytics.start();
      const events: PortalEvent[] = [];

      const stop = page.window.apimatic?.analytics.subscribe((event) => events.push(event));
      analytics.reportPageView();
      analytics.report('docs_search', { search_term: 'refund', picked_result: '', result_count: 0 });
      await settled();

      expect(events).to.be.empty;
      expect(stop).to.be.a('function');
      expect(
        page
          .dataLayer()
          .filter(isPlainObject)
          .map((entry) => entry.event)
      ).to.deep.equal([undefined, 'docs_page_view', undefined, 'docs_search']);
    });

    it('keeps a subscriber through a second instance, as a config save under portal serve makes', async () => {
      const page = browser(quickstart);
      new Analytics(withGtm(), []).start();
      const events = subscribe(page);

      const second = new Analytics(withGtm(), []);
      second.start();
      second.report('docs_markdown_copy', {});
      await settled();

      expect(events.map((event) => event.name)).to.deep.equal(['docs_markdown_copy']);
    });

    // Until the reload lands the bundle goes on calling the new instance, which never joined this window.
    it('adds no tag and hands over no event from an instance whose start asked for a reload', async () => {
      const page = browser(quickstart);
      new Analytics(withGtm(), []).start();
      const events = subscribe(page);

      const next = new Analytics(withGtm(), [{ src: 'https://cdn.example.com/widget.js' }]);
      next.start();
      next.reportPageView();
      await settled();

      expect(page.reloads()).to.equal(1);
      expect(page.scripts.map((script) => script.src)).to.deep.equal([GTM_SCRIPT]);
      expect(events).to.be.empty;
    });
  });

  describe('at an address that holds an OAuth answer', () => {
    it('reports with the answer stripped from page_location', () => {
      const page = browser('https://docs.test/api/pets/listPets#access_token=xyz&state=123', 'List pets');
      const analytics = new Analytics(withBoth, []);

      analytics.start();
      analytics.reportPageView();

      expect(pageViews(page.dataLayer())).to.deep.equal([
        {
          event: 'docs_page_view',
          docs: { page_title: 'List pets', page_location: 'https://docs.test/api/pets/listPets' }
        }
      ]);
    });
  });

  // A sign-in's answer reaches the playground through the tab's session, so no page but the callback waits for one.
  describe('on a page whose own link carries a state parameter', () => {
    it('loads the tags at once, and reports the page without the parameter', () => {
      const page = browser(`${quickstart}?state=CA`);
      const analytics = new Analytics(withBoth, []);

      analytics.start();
      analytics.reportPageView();

      expect(page.scripts.map((script) => script.src)).to.deep.equal([GTM_SCRIPT, GA4_SCRIPT]);
      expect(pageViews(page.dataLayer())).to.deep.equal([quickstartView]);
    });
  });

  describe('on the OAuth callback', () => {
    for (const href of [
      'https://docs.test/oauth/callback?code=abc&state=123',
      'https://docs.test/oauth/callback/?code=abc&state=123',
      'https://docs.test/oauth/callback#access_token=xyz&state=123'
    ]) {
      it(`holds the tags and the page view back at ${href}, and inserts the tags on the next page`, () => {
        const page = browser(href);
        const analytics = new Analytics(withBoth, []);

        analytics.start();
        analytics.reportPageView();

        expect(page.dataLayer()).to.have.length(3);
        expect(pageViews(page.dataLayer())).to.be.empty;
        expect(page.scripts).to.be.empty;

        page.go(quickstart);
        analytics.reportPageView();
        analytics.reportPageView();

        expect(page.scripts.map((script) => script.src)).to.deep.equal([GTM_SCRIPT, GA4_SCRIPT]);
        expect(pageViews(page.dataLayer())).to.have.length(1);
      });

      it(`sends nothing for any event reported at ${href}`, () => {
        const page = browser(href);
        const analytics = new Analytics(withBoth, []);
        analytics.start();

        analytics.report('docs_code_copy', { code_language: 'cURL' });
        analytics.report('docs_markdown_copy', {});

        expect(page.dataLayer()).to.have.length(3);
        expect(gtagCalls(page.dataLayer()).map((command) => command[0])).to.deep.equal(['js', 'config']);
      });
    }
  });

  describe('every adapter', () => {
    const suite: {
      vendor: keyof typeof adapters;
      settings: PortalAnalytics;
      pageViewCall: (entries: unknown[]) => void;
    }[] = [
      {
        vendor: 'googleTagManager',
        settings: withGtm(),
        // The data layer entry is the call; GTM sends nothing of its own.
        pageViewCall: (entries) => expect(entries.filter(isArguments)).to.be.empty
      },
      {
        vendor: 'googleAnalytics',
        settings: withGa4,
        pageViewCall: (entries) => expect(gtagCalls(entries).at(-1)?.slice(0, 2)).to.deep.equal(['event', 'page_view'])
      }
    ];

    it('is covered by this suite', () => {
      expect(suite.map((row) => row.vendor)).to.have.members(Object.keys(adapters));
    });

    for (const { vendor, settings, pageViewCall } of suite) {
      describe(vendor, () => {
        const adapter = (): Adapter => adapters[vendor](settings) ?? expect.fail(`${vendor} builds no adapter`);

        it('builds no adapter from settings without its vendor', () => {
          expect(adapters[vendor](none)).to.be.null;
        });

        it('turns no session recording or input capture on, nor so much as names them', () => {
          browser(quickstart);
          const pushed: unknown[] = [];
          adapter().setup(pushed);

          // A later adapter that has to name them, to turn them off, says here how it does.
          const named = /record|capture|replay/i;
          const entries = pushed.map((entry) => (isArguments(entry) ? Array.from(entry as ArrayLike<unknown>) : entry));
          expect(JSON.stringify(entries)).to.not.match(named);
          expect(adapter().script).to.not.match(named);
        });

        it("turns the vendor's own page view off in its setup", () => {
          browser(quickstart);
          const pushed: unknown[] = [];

          adapter().setup(pushed);

          expect(pushed).to.not.be.empty;
          for (const entry of pushed) {
            expect(entry).to.not.have.property('event', 'page_view');
            const [command, , options] = isArguments(entry) ? Array.from(entry as ArrayLike<unknown>) : [];
            if (command === 'config') expect(options).to.include({ send_page_view: false });
          }
        });

        it('maps docs_page_view to its page view call', () => {
          const page = browser(quickstart);
          const analytics = new Analytics(settings, []);

          analytics.start();
          analytics.reportPageView();

          expect(pageViews(page.dataLayer())).to.have.length(1);
          pageViewCall(page.dataLayer());
        });

        it('receives nothing holding code=, token= or a # part from a report made with an OAuth answer in the address', () => {
          const page = browser('https://docs.test/api/pets/listPets?code=x&state=y#access_token=z', 'List pets');
          const analytics = new Analytics(settings, []);

          analytics.start();
          analytics.report('docs_page_view', { page_title: 'List pets' });

          const received = JSON.stringify(
            page.dataLayer().map((entry) => (isArguments(entry) ? Array.from(entry as ArrayLike<unknown>) : entry))
          );
          expect(received).to.include('https://docs.test/api/pets/listPets');
          expect(received).to.not.match(/code=|token=|#/);
        });

        it('inserts only https scripts, none inline', () => {
          expect(adapter().script).to.match(/^https:\/\//);
          const page = browser(quickstart);

          new Analytics(settings, []).start();

          expect(page.scripts).to.not.be.empty;
          for (const script of page.scripts) {
            expect(script.src).to.match(/^https:\/\//);
            expect(script.textContent).to.equal('');
          }
        });
      });
    }
  });

  describe('report', () => {
    it('pushes a reset entry right before every event entry, which holds event and docs only', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(none, []);
      analytics.start();

      analytics.report('docs_page_view', { page_title: 'A' });
      analytics.report('docs_page_view', { page_title: 'B' });

      const entries = page.dataLayer();
      expect(entries).to.have.length(4);
      for (const index of [1, 3]) {
        expect(entries[index - 1]).to.deep.equal({ docs: null });
        expect(Object.keys(entries[index] as object)).to.deep.equal(['event', 'docs']);
      }
    });

    it("clears the previous event's details for a tag that reads the merged data layer", () => {
      const page = browser(quickstart);
      const analytics = new Analytics(none, []);
      analytics.start();
      analytics.report('docs_code_copy', { code_language: 'python' });
      analytics.report('docs_page_view', { page_title: 'B' });

      expect(mergedLikeGtm(page.dataLayer()).docs).to.deep.equal({ page_title: 'B', page_location: quickstart });
      const withoutResets = page.dataLayer().filter((entry) => !(isPlainObject(entry) && entry.docs === null));
      expect(mergedLikeGtm(withoutResets).docs).to.have.property('code_language', 'python');
    });

    it('reports the page the caller names, not the one the address has moved on to', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(none, []);
      page.go('https://docs.test/guides/authentication');

      analytics.report(
        'docs_search',
        { search_term: 'auth', picked_result: '/guides/authentication', result_count: 3 },
        quickstart
      );

      expect(page.dataLayer().at(-1)).to.have.nested.property('docs.page_location', quickstart);
    });
  });

  // The root effect calls this once on mount and once per page change the router renders.
  describe('reportPageView', () => {
    const components = 'https://docs.test/guides/components';

    it('sends the current page, each with its own title', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(none, []);
      analytics.start();

      analytics.reportPageView();
      page.go(components, 'Components | Acme API');
      analytics.reportPageView();

      expect(pageViews(page.dataLayer())).to.deep.equal([
        quickstartView,
        { event: 'docs_page_view', docs: { page_title: 'Components | Acme API', page_location: components } }
      ]);
    });

    it('sends none when only the # part or the query changed, or nothing changed', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(none, []);
      analytics.start();

      analytics.reportPageView();
      page.go(`${quickstart}#install`);
      analytics.reportPageView();
      page.go(`${quickstart}?tab=python`);
      analytics.reportPageView();
      analytics.reportPageView();

      expect(pageViews(page.dataLayer())).to.have.length(1);
    });

    it('sends three for A, then B, then A', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(none, []);
      analytics.start();

      analytics.reportPageView();
      page.go(components);
      analytics.reportPageView();
      page.go(quickstart);
      analytics.reportPageView();

      expect(
        pageViews(page.dataLayer()).map((view) => (view as { docs: { page_location: string } }).docs.page_location)
      ).to.deep.equal([quickstart, components, quickstart]);
    });
  });
  describe('reportNotFound', () => {
    const missing = 'https://docs.acme.com/guides/missing';
    const referrers = (entries: unknown[]) =>
      entries
        .filter((entry) => isPlainObject(entry) && entry.event === 'docs_not_found')
        .map((entry) => (entry as { docs: { page_referrer: string } }).docs.page_referrer);

    it('names the portal page the reader left for it, whatever the document says', () => {
      const page = browser(
        'https://docs.acme.com/guides/quickstart',
        'Quickstart',
        'https://www.google.com/search?q=acme+docs'
      );
      const analytics = new Analytics(none, []);
      analytics.reportPageView();
      page.go(missing);
      analytics.reportPageView();

      analytics.reportNotFound();

      expect(referrers(page.dataLayer())).to.deep.equal(['https://docs.acme.com/guides/quickstart']);
      expect(page.dataLayer().at(-1)).to.have.nested.property('docs.page_location', missing);
    });

    it('names the page left when the missing page’s own view is yet to be reported', () => {
      const page = browser(
        'https://docs.acme.com/guides/quickstart',
        'Quickstart',
        'https://www.google.com/search?q=acme+docs'
      );
      const analytics = new Analytics(none, []);
      analytics.reportPageView();
      page.go(missing);

      analytics.reportNotFound();
      analytics.reportPageView();

      expect(referrers(page.dataLayer())).to.deep.equal(['https://docs.acme.com/guides/quickstart']);
    });

    it('names the referrer without its query or # part on a first load, and nothing when the browser sends none', () => {
      const fromSearch = browser(missing, 'Not found', 'https://www.google.com/search?q=acme+docs#top');
      new Analytics(none, []).reportNotFound();
      const typedIn = browser(missing, 'Not found');
      new Analytics(none, []).reportNotFound();

      expect(referrers(fromSearch.dataLayer())).to.deep.equal(['https://www.google.com/search']);
      expect(referrers(typedIn.dataLayer())).to.deep.equal(['']);
    });

    it('reports a missing page once, however often its page mounts, and the next missing page again', () => {
      const page = browser(missing);
      const analytics = new Analytics(none, []);

      analytics.reportNotFound();
      analytics.reportNotFound();
      page.go('https://docs.acme.com/guides/also-missing');
      analytics.reportNotFound();

      expect(referrers(page.dataLayer())).to.deep.equal(['', '']);
    });

    it('reports a missing page again when the reader comes back to it from another page', () => {
      const page = browser('https://docs.acme.com/guides/quickstart');
      const analytics = new Analytics(none, []);
      analytics.reportPageView();
      page.go(missing);
      analytics.reportNotFound();
      analytics.reportPageView();
      analytics.reportNotFound();
      page.go('https://docs.acme.com/guides/quickstart');
      analytics.reportPageView();
      page.go(missing);
      analytics.reportPageView();
      analytics.reportNotFound();

      expect(referrers(page.dataLayer())).to.deep.equal([
        'https://docs.acme.com/guides/quickstart',
        'https://docs.acme.com/guides/quickstart'
      ]);
      expect(pageViews(page.dataLayer())).to.have.length(4);
    });
  });
});
