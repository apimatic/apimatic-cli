import { expect } from 'chai';
import { Analytics, pageLocation, PortalEventName, PortalEvents } from '../../portal-template/src/lib/analytics';
import type { PortalAnalytics } from '../../portal-template/src/lib/portal-types';
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
    docs_sdk_download: { language: true },
    docs_code_copy: { language: true },
    docs_search: { search_term: true, result: true, result_count: true },
    docs_not_found: { page_referrer: true },
    docs_api_request: { endpoint: true, status: true, duration_ms: true }
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

interface FakeScript {
  async: boolean;
  src: string;
  textContent: string;
}

interface FakeWindow {
  location: URL & { reload: () => void };
  dataLayer?: unknown[];
  gtag?: (...command: unknown[]) => void;
}

/** A page in the browser: the `window` and `document` the module reads, and the scripts the loader appends. */
function browser(href: string, title = 'Quickstart | Acme API', referrer = '') {
  const scripts: FakeScript[] = [];
  let reloads = 0;
  const window: FakeWindow = { location: Object.assign(new URL(href), { reload: () => (reloads += 1) }) };
  const document = {
    title,
    referrer,
    createElement: (): FakeScript => ({ async: false, src: '', textContent: '' }),
    head: {
      append: (script: FakeScript) => scripts.push(script),
      querySelector: (selector: string) => scripts.find((script) => selector === `script[src="${script.src}"]`) ?? null
    }
  };
  Object.assign(globalThis, { window, document });
  return {
    window,
    scripts,
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

const none: PortalAnalytics = { googleTagManager: null, googleAnalytics: null, keepQueryParams: [] };
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
      const analytics = new Analytics(none);

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
      const analytics = new Analytics(none);

      analytics.start();
      analytics.reportPageView();

      expect(page.dataLayer()).to.deep.equal([existing, { docs: null }, quickstartView]);
    });
  });

  describe('with Google Tag Manager', () => {
    it('pushes the gtm.start entry first, inserts gtm.js, then pushes the page view', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(withGtm());

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

      new Analytics({ ...none, googleTagManager: setting }).start();

      expect(page.scripts.map((script) => script.src)).to.deep.equal([
        'https://www.googletagmanager.com/gtm.js?id=GTM-A%26B&gtm_auth=a%26b&gtm_preview=env%203&gtm_cookies_win=x'
      ]);
    });

    it("loads the container's environment when one is set", () => {
      const page = browser(quickstart);

      new Analytics(withGtm({ auth: 'abc123', preview: 'env-3' })).start();

      expect(page.scripts.map((script) => script.src)).to.deep.equal([
        `${GTM_SCRIPT}&gtm_auth=abc123&gtm_preview=env-3&gtm_cookies_win=x`
      ]);
    });
  });

  describe('with Google Analytics', () => {
    it('pushes js and config with its own page view off, and inserts gtag.js', () => {
      const page = browser(quickstart);

      new Analytics(withGa4).start();

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
      const analytics = new Analytics(withGa4);

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
      const analytics = new Analytics(withGa4);

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
      const analytics = new Analytics(withGa4);

      analytics.start();
      analytics.reportPageView();

      expect(page.dataLayer().filter(isArguments)).to.have.length(4);
      expect(page.dataLayer().some(Array.isArray)).to.be.false;
    });

    it("escapes the measurement ID in the tag's address", () => {
      const page = browser(quickstart);

      new Analytics({ ...none, googleAnalytics: { measurementId: 'G-A#B' } }).start();

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
      const analytics = new Analytics(withGa4);

      analytics.start();
      analytics.reportPageView();

      expect(page.window.gtag).to.equal(existing);
      expect(calls.map((command) => command[0])).to.deep.equal(['js', 'config', 'set', 'event']);
      expect(page.dataLayer().filter(isArguments)).to.be.empty;
    });

    it("sends through the page's gtag from a second instance, as a config save under portal serve makes", () => {
      const page = browser(quickstart);
      new Analytics(withGa4).start();
      const second = new Analytics(withGa4);
      second.start();

      second.report('docs_markdown_copy', {});

      expect(gtagCalls(page.dataLayer()).map((command) => command[0])).to.deep.equal(['js', 'config', 'event']);
    });
  });

  describe('with both vendors', () => {
    it('pushes every setup entry once, gtm.start first, before the first event', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(withBoth);

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

    it('starts once per page, for a second start and for a second instance alike', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(withBoth);

      analytics.start();
      analytics.start();
      new Analytics(withBoth).start();

      expect(page.dataLayer()).to.have.length(3);
      expect(page.scripts).to.have.length(2);
      expect(page.reloads()).to.equal(0);
    });

    it('reloads the page for a start with other vendors, as a config save under portal serve makes', () => {
      const page = browser(quickstart);
      new Analytics(withGtm()).start();

      new Analytics(withBoth).start();

      expect(page.reloads()).to.equal(1);
      expect(page.dataLayer()).to.have.length(1);
      expect(page.scripts.map((script) => script.src)).to.deep.equal([GTM_SCRIPT]);
    });
  });

  describe('after a playground sign-in', () => {
    it('reports with the OAuth answer stripped from page_location', () => {
      const page = browser('https://docs.test/api/pets/listPets#access_token=xyz&state=123', 'List pets');
      const analytics = new Analytics(withBoth);

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

  describe('on the OAuth callback', () => {
    for (const href of [
      'https://docs.test/oauth/callback?code=abc&state=123',
      'https://docs.test/oauth/callback/?code=abc&state=123',
      'https://docs.test/oauth/callback#access_token=xyz&state=123'
    ]) {
      it(`holds the tags and the page view back at ${href}, and inserts the tags on the next page`, () => {
        const page = browser(href);
        const analytics = new Analytics(withBoth);

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
        const analytics = new Analytics(withBoth);
        analytics.start();

        analytics.report('docs_code_copy', { language: 'cURL' });
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
          const analytics = new Analytics(settings);

          analytics.start();
          analytics.reportPageView();

          expect(pageViews(page.dataLayer())).to.have.length(1);
          pageViewCall(page.dataLayer());
        });

        it('receives nothing holding code=, token= or a # part from a report made with an OAuth answer in the address', () => {
          const page = browser('https://docs.test/api/pets/listPets?code=x&state=y#access_token=z', 'List pets');
          const analytics = new Analytics(settings);

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

          new Analytics(settings).start();

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
      const analytics = new Analytics(none);
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
      const analytics = new Analytics(none);
      analytics.start();
      analytics.report('docs_code_copy', { language: 'python' });
      analytics.report('docs_page_view', { page_title: 'B' });

      expect(mergedLikeGtm(page.dataLayer()).docs).to.deep.equal({ page_title: 'B', page_location: quickstart });
      const withoutResets = page.dataLayer().filter((entry) => !(isPlainObject(entry) && entry.docs === null));
      expect(mergedLikeGtm(withoutResets).docs).to.have.property('language', 'python');
    });

    it('reports the page the caller names, not the one the address has moved on to', () => {
      const page = browser(quickstart);
      const analytics = new Analytics(none);
      page.go('https://docs.test/guides/authentication');

      analytics.report(
        'docs_search',
        { search_term: 'auth', result: '/guides/authentication', result_count: 3 },
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
      const analytics = new Analytics(none);
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
      const analytics = new Analytics(none);
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
      const analytics = new Analytics(none);
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
      const analytics = new Analytics(none);
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
      const analytics = new Analytics(none);
      analytics.reportPageView();
      page.go(missing);

      analytics.reportNotFound();
      analytics.reportPageView();

      expect(referrers(page.dataLayer())).to.deep.equal(['https://docs.acme.com/guides/quickstart']);
    });

    it('names the referrer without its query or # part on a first load, and nothing when the browser sends none', () => {
      const fromSearch = browser(missing, 'Not found', 'https://www.google.com/search?q=acme+docs#top');
      new Analytics(none).reportNotFound();
      const typedIn = browser(missing, 'Not found');
      new Analytics(none).reportNotFound();

      expect(referrers(fromSearch.dataLayer())).to.deep.equal(['https://www.google.com/search']);
      expect(referrers(typedIn.dataLayer())).to.deep.equal(['']);
    });

    it('reports a missing page once, however often its page mounts, and the next missing page again', () => {
      const page = browser(missing);
      const analytics = new Analytics(none);

      analytics.reportNotFound();
      analytics.reportNotFound();
      page.go('https://docs.acme.com/guides/also-missing');
      analytics.reportNotFound();

      expect(referrers(page.dataLayer())).to.deep.equal(['', '']);
    });

    it('reports a missing page again when the reader comes back to it from another page', () => {
      const page = browser('https://docs.acme.com/guides/quickstart');
      const analytics = new Analytics(none);
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
  describe('reportApiRequest', () => {
    const address = 'https://docs.acme.com/api/calc/Calculate';
    const endpoint = 'GET /{operation}';
    // The request's own address, which holds filled-in values: never reported.
    const url = 'https://api.acme.com/v1/calc/SUM?x=4&api_key=s3cret';
    const requests = (entries: unknown[]) =>
      entries.filter((entry) => isPlainObject(entry) && entry.event === 'docs_api_request') as {
        docs: Record<string, unknown>;
      }[];

    it('reports a response by its status and its own duration, rounded', () => {
      const page = browser(address);

      new Analytics(none).reportApiRequest(endpoint, { type: 'response', url, status: 200, duration: 123.4 } as never);

      expect(requests(page.dataLayer())).to.deep.equal([
        { event: 'docs_api_request', docs: { endpoint, status: '200', duration_ms: 123, page_location: address } }
      ]);
    });

    it('reports a request that never reached the API as a client error, timed from its start', () => {
      const page = browser(address);
      const analytics = new Analytics(none);
      analytics.requestStarted();

      analytics.reportApiRequest(endpoint, { type: 'client_error', url, message: 'Failed to fetch' } as never);

      const [entry] = requests(page.dataLayer());
      expect(entry.docs).to.include({ endpoint, status: 'client_error', page_location: address });
      expect(entry.docs.duration_ms).to.be.a('number').within(0, 5000);
    });

    it('carries the endpoint, the status and the duration, and nothing of the request', () => {
      const page = browser(address);
      const result = {
        type: 'response',
        url,
        status: 401,
        duration: 8,
        headers: { 'x-key': 's3cret' },
        body: 's3cret'
      };

      new Analytics(none).reportApiRequest(endpoint, result as never);

      const [entry] = requests(page.dataLayer());
      expect(Object.keys(entry.docs).sort()).to.deep.equal(['duration_ms', 'endpoint', 'page_location', 'status']);
      expect(JSON.stringify(entry)).to.not.contain('s3cret');
    });

    it('reports the same result once, however often the display mounts', () => {
      const page = browser(address);
      const analytics = new Analytics(none);
      const result = { type: 'response', url, status: 200, duration: 5 } as never;

      analytics.reportApiRequest(endpoint, result);
      analytics.reportApiRequest(endpoint, result);
      analytics.reportApiRequest(endpoint, { type: 'response', url, status: 200, duration: 5 } as never);

      expect(requests(page.dataLayer())).to.have.length(2);
    });

    it('reports a request that failed before it was sent with no duration', () => {
      const page = browser(address);

      new Analytics(none).reportApiRequest(endpoint, { type: 'client_error', url, message: 'No adapter' } as never);

      expect(requests(page.dataLayer())[0].docs).to.include({ status: 'client_error', duration_ms: 0 });
    });

    it('times a client error from no start once the playground left the page with a request in flight', () => {
      const page = browser(address);
      const analytics = new Analytics(none);
      analytics.requestStarted();
      analytics.requestAbandoned();

      analytics.reportApiRequest(endpoint, { type: 'client_error', url, message: 'No adapter' } as never);

      expect(requests(page.dataLayer())[0].docs).to.include({ status: 'client_error', duration_ms: 0 });
    });
  });
});
