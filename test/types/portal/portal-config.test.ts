import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { PortalConfig } from '../../../src/types/portal/portal-config';
import { SuggestedSite } from '../../../src/types/portal/config/site-config';

describe('PortalConfig', () => {
  const suggested: SuggestedSite = { name: 'Spec Title', description: 'What the spec says.' };
  const source = new DirectoryPath('src');

  // Through JSON so the block is what a file would hand over: `undefined` fields dropped.
  const parse = (value: unknown, site: SuggestedSite | null = suggested) =>
    PortalConfig.fromBlock(JSON.parse(JSON.stringify(value)), site);
  const config = (value: unknown, site: SuggestedSite | null = suggested) => parse(value, site)._unsafeUnwrap();
  const errorsOf = (value: unknown, site: SuggestedSite | null = suggested) => parse(value, site)._unsafeUnwrapErr();

  describe('the block itself', () => {
    it('is required', () => {
      expect(PortalConfig.fromBlock(undefined, suggested)._unsafeUnwrapErr()).to.deep.equal(["'portal' is required."]);
    });

    it('must be a JSON object, and says so rather than calling a present block missing', () => {
      for (const block of ['Calc', [], null, 7]) {
        expect(PortalConfig.fromBlock(block, suggested)._unsafeUnwrapErr(), JSON.stringify(block)).to.deep.equal([
          "'portal' must be a JSON object."
        ]);
      }
    });

    it('builds a portal from an empty block, with every default', () => {
      const portal = config({});
      const identity = portal.identity();

      expect(portal.siteTitle()).to.equal('Spec Title');
      expect(identity.description).to.equal('What the spec says.');
      expect(identity.siteUrl).to.be.null;
      expect(portal.brandSettings().logoImages()).to.be.null;
      expect(portal.brandSettings().faviconImage()).to.be.null;
      expect(portal.brandSettings().brandColors().primaryColors()).to.be.null;
      expect(portal.brandSettings().mode()).to.equal('both');
      expect(identity.links).to.be.empty;
      expect(identity.pageActions).to.be.true;
      expect(portal.staticFiles()).to.be.empty;
    });

    it('refuses a namespace that is not an object', () => {
      expect(errorsOf({ site: 'Calc', brand: [] })).to.deep.equal([
        "'portal.site' must be a JSON object.",
        "'portal.brand' must be a JSON object."
      ]);
    });
  });

  describe('unknown settings', () => {
    it('names each by its dotted path, at every level', () => {
      expect(
        errorsOf({
          theme: {},
          site: { title: 'x' },
          brand: { colors: { accent: '#fff' } },
          ai: { hideActions: true }
        })
      ).to.deep.equal([
        "'portal.theme' is not a 'portal' setting.",
        "'portal.site.title' is not a 'portal' setting.",
        "'portal.brand.colors.accent' is not a 'portal' setting.",
        "'portal.ai.hideActions' is not a 'portal' setting."
      ]);
    });

    // The flat block never shipped, so its keys get no migration hint.
    it('reports the flat keys of the earlier block as unknown, with no hint', () => {
      expect(errorsOf({ title: 'Calc', siteUrl: 'https://docs.test', aiPageActions: false })).to.deep.equal([
        "'portal.title' is not a 'portal' setting.",
        "'portal.siteUrl' is not a 'portal' setting.",
        "'portal.aiPageActions' is not a 'portal' setting."
      ]);
    });

    // `JSON.parse` will happily hand back a document keyed by a prototype member.
    it('reports a key named after a prototype member like any other', () => {
      const errors = PortalConfig.fromBlock(JSON.parse('{"toString":"x","site":{"constructor":1}}'), suggested);

      expect(errors._unsafeUnwrapErr()).to.deep.equal([
        "'portal.toString' is not a 'portal' setting.",
        "'portal.site.constructor' is not a 'portal' setting."
      ]);
    });

    it('reports them alongside every invalid setting, so one edit fixes the file', () => {
      const errors = errorsOf({
        theme: {},
        site: { name: '', url: 'https://x.test/?a=1' },
        brand: { colorMode: 'sepia' },
        ai: { pageActions: 'no' }
      });

      expect(errors).to.have.lengthOf(5);
      expect(errors[0]).to.equal("'portal.theme' is not a 'portal' setting.");
    });
  });

  describe('site', () => {
    it('takes the name the block gives over the specification’s, trimmed', () => {
      expect(config({ site: { name: '  Calc  ' } }).siteTitle()).to.equal('Calc');
    });

    it('refuses a blank name rather than falling back to the specification’s', () => {
      for (const name of ['', '   ', 7]) {
        expect(errorsOf({ site: { name } }), JSON.stringify(name)).to.deep.equal([
          "'portal.site.name' must be a non-empty string."
        ]);
      }
    });

    it('requires a name when there are several specifications, since none of them speaks for the portal', () => {
      expect(errorsOf({}, null)).to.deep.equal([
        "'portal.site.name' is required when 'spec' holds more than one specification."
      ]);
      expect(config({ site: { name: 'Calc' } }, null).siteTitle()).to.equal('Calc');
    });

    it('has no description with several specifications unless the block gives one', () => {
      expect(config({ site: { name: 'Calc' } }, null).identity().description).to.be.null;
    });

    it('trims the description', () => {
      expect(config({ site: { description: '  Docs  ' } }).identity().description).to.equal('Docs');
    });

    // Blank is how the block turns the specification's description off.
    it('treats a blank description as none, not as absent', () => {
      for (const description of ['', '   ', '\n\t']) {
        expect(config({ site: { description } }).identity().description, JSON.stringify(description)).to.be.null;
      }
    });

    it('refuses a description that is not a string', () => {
      expect(errorsOf({ site: { description: 5 } })).to.deep.equal(["'portal.site.description' must be a string."]);
    });

    it('keeps the path of the address, dropping a trailing slash and keeping a port', () => {
      expect(config({ site: { url: 'https://docs.example.com/' } }).identity().siteUrl).to.equal(
        'https://docs.example.com'
      );
      expect(config({ site: { url: 'https://docs.example.com:8443' } }).identity().siteUrl).to.equal(
        'https://docs.example.com:8443'
      );
      expect(config({ site: { url: 'HTTPS://Example.com/Docs/v2/' } }).identity().siteUrl).to.equal(
        'https://example.com/Docs/v2'
      );
    });

    it('hands over the address it parsed, or none without one', () => {
      const address = config({ site: { url: 'https://acme.github.io/docs/' } }).siteAddress();

      expect(address?.path()).to.equal('/docs/');
      expect(config({}).siteAddress()).to.be.null;
    });

    it('refuses an address carrying a query or fragment, or one that is not http', () => {
      for (const url of ['https://x.test/?a=1', 'https://x.test/#top', 'ftp://x.test', 'x.test', 'https:x.test', '']) {
        expect(errorsOf({ site: { url } }), url).to.have.lengthOf(1);
      }
    });
  });

  describe('brand', () => {
    describe('logo', () => {
      it('uses one path for both modes', () => {
        const logo = config({ brand: { logo: 'static/images/logo.png' } })
          .brandSettings()
          .logoImages();

        expect(logo?.light().portalPath()).to.equal('/images/logo.png');
        expect(logo?.dark().portalPath()).to.equal('/images/logo.png');
      });

      it('takes a path per mode', () => {
        const logo = config({ brand: { logo: { light: 'static/light.svg', dark: 'static/dark.svg' } } })
          .brandSettings()
          .logoImages();

        expect(logo?.light().portalPath()).to.equal('/light.svg');
        expect(logo?.dark().portalPath()).to.equal('/dark.svg');
      });

      it('needs both modes once it names either', () => {
        expect(errorsOf({ brand: { logo: { light: 'static/light.svg' } } })).to.deep.equal([
          "'portal.brand.logo.dark' is required."
        ]);
        expect(errorsOf({ brand: { logo: { light: 'static/light.svg', dark: '' } } })).to.deep.equal([
          "'portal.brand.logo.dark' must be a non-empty string."
        ]);
      });

      it('refuses anything but a path or a pair', () => {
        expect(errorsOf({ brand: { logo: 7 } })).to.deep.equal([
          "'portal.brand.logo' must be a string, or an object with 'light' and 'dark'."
        ]);
        expect(errorsOf({ brand: { logo: { light: 'static/a.svg', dark: 'static/b.svg', auto: 'x' } } })).to.deep.equal(
          ["'portal.brand.logo.auto' is not a 'portal' setting."]
        );
      });

      it('accepts backslashes and a leading ./ from hand-written paths', () => {
        const logo = config({ brand: { logo: './static\\images\\logo.png' } })
          .brandSettings()
          .logoImages();

        expect(logo?.light().portalPath()).to.equal('/images/logo.png');
        expect(logo?.light().resolveIn(source).relativeTo(source)).to.equal('static/images/logo.png');
      });

      it('refuses a path outside static/, one escaping it, and one that names no file', () => {
        for (const logo of ['images/logo.png', 'static/', 'static/../secret.png', 'static/images/', '']) {
          expect(errorsOf({ brand: { logo } }), logo).to.have.lengthOf(1);
        }
      });

      // `static//logo.png` finds the file on disk, and would be served as `//logo.png`: an
      // address the browser fetches from a host called `logo.png`.
      it('refuses a path with a name missing, or one standing for the directory it is in', () => {
        for (const logo of ['static//logo.png', 'static\\\\logo.png', 'static/./logo.png', 'static/ /logo.png']) {
          expect(errorsOf({ brand: { logo } }), logo).to.have.lengthOf(1);
        }
      });

      it('escapes each name in the address it is served at', () => {
        const logo = config({ brand: { logo: 'static/my logo #1?.png' } })
          .brandSettings()
          .logoImages();

        expect(logo?.light().portalPath()).to.equal('/my%20logo%20%231%3F.png');
        expect(logo?.light().resolveIn(source).relativeTo(source)).to.equal('static/my logo #1?.png');
      });
    });

    describe('favicon', () => {
      it('defaults to the light logo', () => {
        const brand = config({
          brand: { logo: { light: 'static/light.svg', dark: 'static/dark.svg' } }
        }).brandSettings();

        expect(brand.faviconImage()?.portalPath()).to.equal('/light.svg');
      });

      it('is the file the block names when it names one', () => {
        const brand = config({ brand: { logo: 'static/logo.svg', favicon: 'static/favicon.ico' } }).brandSettings();

        expect(brand.faviconImage()?.portalPath()).to.equal('/favicon.ico');
      });

      it('refuses a path outside static/', () => {
        expect(errorsOf({ brand: { favicon: 'favicon.ico' } })).to.have.lengthOf(1);
      });
    });

    it('lists every file it names once, each with the setting that names it', () => {
      const files = (brand: object) =>
        config({ brand })
          .staticFiles()
          .map((file) => [file.settingPath(), file.resolveIn(source).relativeTo(source)]);

      expect(files({ logo: 'static/logo.svg' })).to.deep.equal([['portal.brand.logo', 'static/logo.svg']]);
      expect(
        files({ logo: { light: 'static/light.svg', dark: 'static/dark.svg' }, favicon: 'static/favicon.ico' })
      ).to.deep.equal([
        ['portal.brand.logo.light', 'static/light.svg'],
        ['portal.brand.logo.dark', 'static/dark.svg'],
        ['portal.brand.favicon', 'static/favicon.ico']
      ]);
      expect(
        files({ logo: { light: 'static/logo.svg', dark: 'static/logo.svg' }, favicon: './static/logo.svg' })
      ).to.deep.equal([['portal.brand.logo.light', 'static/logo.svg']]);
    });

    describe('colors', () => {
      it('uses one primary for both modes, or one per mode', () => {
        const single = config({ brand: { colors: { primary: '#1d4ed8' } } })
          .brandSettings()
          .brandColors();
        const pair = config({ brand: { colors: { primary: { light: '#1d4ed8', dark: '#93c5fd' } } } })
          .brandSettings()
          .brandColors();

        expect(single.primaryColors()?.light.toString()).to.equal('#1d4ed8');
        expect(single.primaryColors()?.dark.toString()).to.equal('#1d4ed8');
        expect(pair.primaryColors()?.dark.toString()).to.equal('#93c5fd');
      });

      it('refuses a primary that is not hex', () => {
        expect(errorsOf({ brand: { colors: { primary: 'blue' } } })).to.deep.equal([
          "'portal.brand.colors.primary' must be a colour written as #rgb or #rrggbb, for example '#1d4ed8'."
        ]);
        expect(
          errorsOf({ brand: { colors: { primary: { light: '#fff', dark: 'hsl(210, 90%, 80%)' } } } })
        ).to.have.lengthOf(1);
      });
    });

    it('accepts the listed colour modes, and refuses others', () => {
      expect(
        config({ brand: { colorMode: 'dark' } })
          .brandSettings()
          .mode()
      ).to.equal('dark');
      expect(errorsOf({ brand: { colorMode: 'auto' } })).to.deep.equal([
        "'portal.brand.colorMode' must be one of 'light', 'dark' or 'both'."
      ]);
    });
  });

  describe('navigation', () => {
    it('marks a link to another site external and a page of the portal not', () => {
      const { links } = config({
        navigation: {
          links: [
            { label: 'Status', url: 'https://status.example.com' },
            { label: 'Auth', url: '/authentication' }
          ]
        }
      }).identity();

      expect(links).to.deep.equal([
        { label: 'Status', url: 'https://status.example.com', external: true },
        { label: 'Auth', url: '/authentication', external: false }
      ]);
    });

    it('refuses an address that is neither a page of the portal nor a web address', () => {
      for (const url of ['mailto:docs@example.com', 'docs/x', 'javascript:alert(1)', '//example.com', '']) {
        expect(errorsOf({ navigation: { links: [{ label: 'x', url }] } }), url).to.deep.equal([
          "'portal.navigation.links[0].url' must be a page of the portal starting with '/', or an address starting with 'https://' or 'http://'."
        ]);
      }
    });

    // Each starts with '/' or 'https:', and a browser still takes it to another site, or on an
    // https portal to a path of its own.
    it('refuses an address a browser reads differently from how it is written', () => {
      for (const url of [
        '/\\example.com',
        '/\t/example.com',
        '/\n/example.com',
        'https:example.com',
        'https:/example.com'
      ]) {
        expect(errorsOf({ navigation: { links: [{ label: 'x', url }] } }), JSON.stringify(url)).to.have.lengthOf(1);
      }
    });

    // Past its dot segments each resolves to `//example.com`, which the header writes out as another site.
    it('refuses a page with an empty segment in its path', () => {
      for (const url of [
        '/docs//page',
        '/.//example.com',
        '/..//example.com',
        '/%2e//example.com',
        '/docs/..//example.com',
        '/././/example.com',
        '/.\t//example.com'
      ]) {
        expect(errorsOf({ navigation: { links: [{ label: 'x', url }] } }), JSON.stringify(url)).to.have.lengthOf(1);
      }
    });

    it('writes a page of the portal as the browser resolves it', () => {
      const [link] = config({
        navigation: { links: [{ label: 'x', url: '/guides/../start here?tab=1#top' }] }
      }).identity().links;

      expect(link.url).to.equal('/start%20here?tab=1#top');
    });

    it('names each broken link by its position', () => {
      expect(
        errorsOf({ navigation: { links: [{ label: 'ok', url: '/' }, 'Status', { label: ' ', url: '/', icon: 'x' }] } })
      ).to.deep.equal([
        "'portal.navigation.links[1]' must be a JSON object with 'label' and 'url'.",
        "'portal.navigation.links[2].icon' is not a 'portal' setting.",
        "'portal.navigation.links[2].label' must be a non-empty string."
      ]);
      expect(errorsOf({ navigation: { links: {} } })).to.deep.equal([
        "'portal.navigation.links' must be a list of links."
      ]);
    });
  });

  describe('ai', () => {
    // Each page offers to open itself in ChatGPT, Claude, Cursor or Scira. A portal
    // published under someone else's brand carries that endorsement, so it can be refused.
    it('offers the page actions unless the block turns them off', () => {
      expect(config({ ai: { pageActions: false } }).identity().pageActions).to.be.false;
      expect(errorsOf({ ai: { pageActions: 'no' } })).to.deep.equal(["'portal.ai.pageActions' must be true or false."]);
    });
  });

  describe('analytics', () => {
    const gtm = 'portal.analytics.googleTagManager';
    const ga = 'portal.analytics.googleAnalytics';
    const keep = 'portal.analytics.keepQueryParams';

    it('tells the browser to load nothing when the block sets nothing', () => {
      expect(config({}).identity().analytics).to.deep.equal({
        googleTagManager: null,
        googleAnalytics: null,
        googleConsentMode: null,
        keepQueryParams: [],
        eventFeed: 'on'
      });
    });

    it('keeps both vendors with their IDs trimmed, the environment and every kept name, an OAuth answer’s included', () => {
      const analytics = {
        googleTagManager: { containerId: ' GTM-ABC123 ', environment: { auth: 'a1_b-2', preview: 'env-3' } },
        googleAnalytics: { measurementId: ' G-ABC123 ' },
        keepQueryParams: ['campaign_id', ' code ']
      };

      expect(config({ analytics }).identity().analytics).to.deep.equal({
        googleTagManager: { containerId: 'GTM-ABC123', environment: { auth: 'a1_b-2', preview: 'env-3' } },
        googleAnalytics: { measurementId: 'G-ABC123' },
        googleConsentMode: null,
        keepQueryParams: ['campaign_id', 'code'],
        eventFeed: 'on'
      });
    });

    it('tells the browser to start the Google tags as denied, beside either vendor, both or neither', () => {
      const googleConsentMode = { default: 'denied' };
      const vendors = [
        {},
        { googleTagManager: { containerId: 'GTM-ABC123' } },
        { googleAnalytics: { measurementId: 'G-ABC123' } },
        { googleTagManager: { containerId: 'GTM-ABC123' }, googleAnalytics: { measurementId: 'G-ABC123' } }
      ];

      for (const set of vendors) {
        expect(
          config({ analytics: { ...set, googleConsentMode } }).identity().analytics.googleConsentMode,
          JSON.stringify(set)
        ).to.deep.equal(googleConsentMode);
      }
    });

    it('refuses a consent mode that is not an object with default set to denied, each mistake by name', () => {
      const mode = 'portal.analytics.googleConsentMode';
      const errorsFor = (googleConsentMode: unknown) => errorsOf({ analytics: { googleConsentMode } });

      expect(errorsFor('denied')).to.deep.equal([`'${mode}' must be a JSON object with 'default'.`]);
      expect(errorsFor(true)).to.deep.equal([`'${mode}' must be a JSON object with 'default'.`]);
      expect(errorsFor({})).to.deep.equal([`'${mode}.default' is required.`]);
      expect(errorsFor({ default: 'granted' })).to.deep.equal([`'${mode}.default' must be 'denied'.`]);
      expect(errorsFor({ default: 'Denied', region: ['DE'] })).to.deep.equal([
        `'${mode}.region' is not a 'portal' setting.`,
        `'${mode}.default' must be 'denied'.`
      ]);
    });

    // What a build made with --no-analytics turns off is the flag's to say, never a line in the file.
    it('hands events to scripts in every config as written, and takes no setting that says otherwise', () => {
      expect(config({}).identity().analytics.eventFeed).to.equal('on');
      expect(errorsOf({ analytics: { eventFeed: 'off' } })).to.deep.equal([
        "'portal.analytics.eventFeed' is not a 'portal' setting."
      ]);
    });

    it('refuses a block, a vendor or an environment that is not an object, as a bare ID is the likely slip', () => {
      expect(errorsOf({ analytics: 'GTM-ABC123' })).to.deep.equal(["'portal.analytics' must be a JSON object."]);
      expect(errorsOf({ analytics: { googleTagManager: 'GTM-ABC123' } })).to.deep.equal([
        `'${gtm}' must be a JSON object with 'containerId'.`
      ]);
      expect(errorsOf({ analytics: { googleAnalytics: 'G-ABC123' } })).to.deep.equal([
        `'${ga}' must be a JSON object with 'measurementId'.`
      ]);
      expect(
        errorsOf({ analytics: { googleTagManager: { containerId: 'GTM-ABC123', environment: 'env-3' } } })
      ).to.deep.equal([`'${gtm}.environment' must be a JSON object with 'auth' and 'preview'.`]);
    });

    it('requires each ID as a non-empty string, and leaves its format to the vendor', () => {
      expect(errorsOf({ analytics: { googleTagManager: {}, googleAnalytics: {} } })).to.deep.equal([
        `'${gtm}.containerId' is required.`,
        `'${ga}.measurementId' is required.`
      ]);
      expect(
        errorsOf({ analytics: { googleTagManager: { containerId: ' ' }, googleAnalytics: { measurementId: 1 } } })
      ).to.deep.equal([
        `'${gtm}.containerId' must be a non-empty string.`,
        `'${ga}.measurementId' must be a non-empty string.`
      ]);
      expect(
        config({ analytics: { googleTagManager: { containerId: 'gtm-abc123' } } }).identity().analytics.googleTagManager
      ).to.deep.equal({ containerId: 'gtm-abc123', environment: null });
    });

    it('requires both environment values as non-empty strings', () => {
      const withEnvironment = (environment: unknown) =>
        errorsOf({ analytics: { googleTagManager: { containerId: 'GTM-ABC123', environment } } });

      expect(withEnvironment({})).to.deep.equal([
        `'${gtm}.environment.auth' is required.`,
        `'${gtm}.environment.preview' is required.`
      ]);
      expect(withEnvironment({ auth: '', preview: 3 })).to.deep.equal([
        `'${gtm}.environment.auth' must be a non-empty string.`,
        `'${gtm}.environment.preview' must be a non-empty string.`
      ]);
    });

    it('names an unknown key beside a vendor or an environment like any other', () => {
      expect(
        errorsOf({
          analytics: {
            posthog: {},
            googleTagManager: {
              containerId: 'GTM-ABC123',
              serverUrl: 'x',
              environment: { auth: 'a', preview: 'env-1', url: 'x' }
            },
            googleAnalytics: { measurementId: 'G-ABC123', debug: true }
          }
        })
      ).to.deep.equal([
        "'portal.analytics.posthog' is not a 'portal' setting.",
        `'${gtm}.serverUrl' is not a 'portal' setting.`,
        `'${gtm}.environment.url' is not a 'portal' setting.`,
        `'${ga}.debug' is not a 'portal' setting.`
      ]);
    });

    it('takes a list of kept names, each a non-empty string', () => {
      expect(errorsOf({ analytics: { keepQueryParams: 'campaign_id' } })).to.deep.equal([
        `'${keep}' must be a list of query parameter names.`
      ]);
      expect(errorsOf({ analytics: { keepQueryParams: ['', ' ', 1] } })).to.deep.equal([
        `'${keep}[0]' must be a non-empty string.`,
        `'${keep}[1]' must be a non-empty string.`,
        `'${keep}[2]' must be a non-empty string.`
      ]);
    });

    it('reports every fault at once, unknown keys first', () => {
      expect(
        errorsOf({
          analytics: {
            posthog: {},
            googleTagManager: { containerId: '' },
            googleAnalytics: 'G-1',
            keepQueryParams: [1]
          }
        })
      ).to.deep.equal([
        "'portal.analytics.posthog' is not a 'portal' setting.",
        `'${gtm}.containerId' must be a non-empty string.`,
        `'${ga}' must be a JSON object with 'measurementId'.`,
        `'${keep}[0]' must be a non-empty string.`
      ]);
    });

    it('tells a build without analytics to load no vendor, queue no consent default and hand over no event', () => {
      const analytics = {
        googleTagManager: { containerId: 'GTM-ABC123' },
        googleAnalytics: { measurementId: 'G-ABC123' },
        googleConsentMode: { default: 'denied' },
        keepQueryParams: ['campaign_id']
      };
      const portal = config({ analytics });

      expect(portal.withoutAnalytics().identity()).to.deep.equal({
        ...portal.identity(),
        analytics: {
          googleTagManager: null,
          googleAnalytics: null,
          googleConsentMode: null,
          keepQueryParams: ['campaign_id'],
          eventFeed: 'off'
        }
      });
    });

    it('refuses a null block, and an environment without its auth value', () => {
      expect(errorsOf({ analytics: null })).to.deep.equal(["'portal.analytics' must be a JSON object."]);
      expect(
        errorsOf({ analytics: { googleTagManager: { containerId: 'GTM-ABC123', environment: { preview: 'env-3' } } } })
      ).to.deep.equal([`'${gtm}.environment.auth' is required.`]);
    });

    it('keeps an empty list of names as none', () => {
      expect(config({ analytics: { keepQueryParams: [] } }).identity().analytics.keepQueryParams).to.deep.equal([]);
    });

    it('uses Google Analytics only with a measurement ID', () => {
      expect(config({}).usesGoogleAnalytics()).to.be.false;
      expect(config({ analytics: { googleTagManager: { containerId: 'GTM-ABC123' } } }).usesGoogleAnalytics()).to.be
        .false;
      expect(config({ analytics: { googleAnalytics: { measurementId: 'G-ABC123' } } }).usesGoogleAnalytics()).to.be
        .true;
    });
  });

  describe('seo', () => {
    it('carries the verification value to the browser, or null without one', () => {
      expect(config({ seo: { googleSiteVerification: 'abc_123-XYZ' } }).identity().seo).to.deep.equal({
        googleSiteVerification: 'abc_123-XYZ'
      });
      expect(config({}).identity().seo).to.deep.equal({ googleSiteVerification: null });
    });

    it('refuses a block that is not an object, and a blank value', () => {
      expect(errorsOf({ seo: 'abc' })).to.deep.equal(["'portal.seo' must be a JSON object."]);
      expect(errorsOf({ seo: null })).to.deep.equal(["'portal.seo' must be a JSON object."]);
      expect(errorsOf({ seo: { foo: 1 } })).to.deep.equal(["'portal.seo.foo' is not a 'portal' setting."]);
      expect(errorsOf({ seo: { googleSiteVerification: ' ' } })).to.deep.equal([
        "'portal.seo.googleSiteVerification' must be a non-empty string."
      ]);
    });
  });

  describe('scripts', () => {
    const SETUP = 'https://cdn.example.com/setup.js';
    const WIDGET = 'https://cdn.example.com/widget.js';
    const refused = (path: string) =>
      `'${path}' must be an address starting with 'https://', with no spaces, for example ` +
      "'https://cdn.example.com/widget.js'.";

    it('lists none unless the block does', () => {
      expect(config({}).identity().scripts).to.be.empty;
    });

    it('tells the browser each address, in the order listed', () => {
      const scripts = [{ src: SETUP }, { src: WIDGET }];

      expect(config({ scripts }).identity().scripts).to.deep.equal(scripts);
    });

    it('must be a list', () => {
      for (const scripts of [WIDGET, { src: WIDGET }, null, 7]) {
        expect(errorsOf({ scripts }), JSON.stringify(scripts)).to.deep.equal([
          "'portal.scripts' must be a list of scripts."
        ]);
      }
    });

    it('takes each entry as an object, never a bare address', () => {
      for (const entry of [WIDGET, [WIDGET], null, 7]) {
        expect(errorsOf({ scripts: [entry] }), JSON.stringify(entry)).to.deep.equal([
          "'portal.scripts[0]' must be a JSON object with 'src'."
        ]);
      }
    });

    it('asks for src', () => {
      expect(errorsOf({ scripts: [{}] })).to.deep.equal(["'portal.scripts[0].src' is required."]);
    });

    // Neither is a setting in this release: a file in static/ adds a tag that needs attributes of its own.
    it('names a key it does not know, integrity and attributes among them', () => {
      expect(
        errorsOf({ scripts: [{ src: WIDGET, integrity: 'sha384-abc', attributes: { 'data-site': 'acme' } }] })
      ).to.deep.equal([
        "'portal.scripts[0].integrity' is not a 'portal' setting.",
        "'portal.scripts[0].attributes' is not a 'portal' setting."
      ]);
    });

    // The browser runs what it fetches, and a portal served over https blocks a script that is not.
    it('refuses an address that is not https, or that holds a space', () => {
      for (const src of [
        'http://cdn.example.com/widget.js',
        'HTTP://cdn.example.com/widget.js',
        'https://',
        'https:cdn.example.com/widget.js',
        'https://cdn.example.com/my widget.js',
        ' https://cdn.example.com/widget.js'
      ]) {
        expect(errorsOf({ scripts: [{ src }] }), JSON.stringify(src)).to.deep.equal([refused('portal.scripts[0].src')]);
      }
    });

    it('takes a file in the static directory, however its path is written, and tells the browser its place in the portal', () => {
      for (const src of ['static/js/widget.js', './static/js/widget.js', '.\\static\\js\\widget.js']) {
        expect(config({ scripts: [{ src }] }).identity().scripts, src).to.deep.equal([{ src: '/js/widget.js' }]);
      }
    });

    it("names its files after the brand's, each by its entry, for the check that they are on disk", () => {
      const portal = config({
        brand: { favicon: 'static/favicon.ico' },
        scripts: [{ src: WIDGET }, { src: 'static/js/widget.js' }, { src: 'static/js/setup.js' }]
      });

      expect(portal.staticFiles().map((file) => [file.settingPath(), file.portalPath()])).to.deep.equal([
        ['portal.brand.favicon', '/favicon.ico'],
        ['portal.scripts[1].src', '/js/widget.js'],
        ['portal.scripts[2].src', '/js/setup.js']
      ]);
    });

    // One report names both, since a path that is no file here is often an address without its https://.
    it('refuses what is neither an https address nor a file in the static directory', () => {
      for (const src of [
        'js/widget.js',
        'static',
        'static/',
        'static/../widget.js',
        'static//widget.js',
        '/static/js/widget.js',
        '//cdn.example.com/widget.js',
        'cdn.example.com/widget.js',
        '',
        ' ',
        7,
        null
      ]) {
        expect(errorsOf({ scripts: [{ src }] }), JSON.stringify(src)).to.deep.equal([
          "'portal.scripts[0].src' must be an address starting with 'https://', or a path relative to 'src' inside " +
            "the 'static' directory, for example 'static/analytics.js'."
        ]);
      }
    });

    it('takes one of four categories, and refuses any other', () => {
      for (const category of ['necessary', 'functional', 'analytics', 'marketing']) {
        expect(parse({ scripts: [{ src: WIDGET, category }] }).isOk(), category).to.be.true;
      }
      for (const category of ['Necessary', 'essential', '', 7, null]) {
        expect(errorsOf({ scripts: [{ src: WIDGET, category }] }), JSON.stringify(category)).to.deep.equal([
          "'portal.scripts[0].category' must be one of 'necessary', 'functional', 'analytics' or 'marketing'."
        ]);
      }
    });

    // The one with no category goes too: nobody vouched that it counts no readers.
    it('keeps only necessary and functional scripts without analytics, in their order, and tells the browser no category', () => {
      const at = (name: string) => `https://cdn.example.com/${name}.js`;
      const portal = config({
        scripts: [
          { src: at('pixel'), category: 'marketing' },
          { src: at('chat'), category: 'functional' },
          { src: at('uncategorised') },
          { src: 'static/js/banner.js', category: 'necessary' },
          { src: 'static/js/counter.js', category: 'analytics' }
        ]
      });

      expect(portal.identity().scripts).to.deep.equal([
        { src: at('pixel') },
        { src: at('chat') },
        { src: at('uncategorised') },
        { src: '/js/banner.js' },
        { src: '/js/counter.js' }
      ]);
      expect(portal.withoutAnalytics().identity().scripts).to.deep.equal([
        { src: at('chat') },
        { src: '/js/banner.js' }
      ]);
      expect(
        portal
          .withoutAnalytics()
          .staticFiles()
          .map((file) => file.settingPath())
      ).to.deep.equal(['portal.scripts[3].src']);
    });

    it('reports every entry at once, each by its place in the list', () => {
      expect(
        errorsOf({ scripts: [{ src: WIDGET }, { src: 'http://cdn.example.com/a.js', defer: true }, WIDGET] })
      ).to.deep.equal([
        "'portal.scripts[1].defer' is not a 'portal' setting.",
        refused('portal.scripts[1].src'),
        "'portal.scripts[2]' must be a JSON object with 'src'."
      ]);
    });

    it('keeps the address as it parses: the host in lowercase, and a query whole', () => {
      const scripts = [{ src: 'https://CDN.Example.com/widget.js?site=a%2Fb&v=2' }];

      expect(config({ scripts }).identity().scripts).to.deep.equal([
        { src: 'https://cdn.example.com/widget.js?site=a%2Fb&v=2' }
      ]);
    });
  });

  describe('pluginUrl', () => {
    const REFUSED =
      "'portal.pluginUrl' must be an address starting with 'https://', with no spaces, for example " +
      "'https://example.com/acme-plugin.zip'.";

    it('is absent unless the block gives one, so the plugin is bundled', () => {
      expect(config({}).pluginUrl()).to.be.null;
    });

    it('keeps an https address where the plugin is hosted', () => {
      expect(`${config({ pluginUrl: 'https://plugins.acme.test/calc.zip' }).pluginUrl()}`).to.equal(
        'https://plugins.acme.test/calc.zip'
      );
    });

    // It is handed to `npx context-plugins install`, which fetches and runs what it finds.
    it('refuses anything but an https address', () => {
      for (const pluginUrl of [
        'http://plugins.acme.test/calc.zip',
        '/__downloads/plugin.zip',
        'https://',
        'https:x.test',
        '',
        7
      ]) {
        expect(errorsOf({ pluginUrl }), JSON.stringify(pluginUrl)).to.deep.equal([REFUSED]);
      }
    });

    // A space would split the address in the install command a reader pastes into a shell.
    it('refuses an address with whitespace anywhere in it', () => {
      for (const pluginUrl of [
        'https://plugins.acme.test/my plugin.zip',
        'https://plugins.acme.test/calc.zip ',
        ' https://plugins.acme.test/calc.zip',
        'https://plugins.acme.test/calc.zip\n'
      ]) {
        expect(errorsOf({ pluginUrl }), JSON.stringify(pluginUrl)).to.deep.equal([REFUSED]);
      }
    });

    it('keeps the address as it parses: a query of several parameters whole, and a quote encoded', () => {
      const presigned = 'https://bucket.s3.amazonaws.com/calc.zip?X-Amz-Credential=a%2Fb&X-Amz-Signature=c';

      expect(`${config({ pluginUrl: presigned }).pluginUrl()}`).to.equal(presigned);
      expect(`${config({ pluginUrl: 'https://Plugins.Acme.test/"calc".zip' }).pluginUrl()}`).to.equal(
        'https://plugins.acme.test/%22calc%22.zip'
      );
    });

    it('is kept out of what the browser is told', () => {
      expect(config({ pluginUrl: 'https://plugins.acme.test/calc.zip' }).identity()).to.not.have.property('pluginUrl');
    });

    it('is serialised only when the block gives one', () => {
      expect(JSON.parse(JSON.stringify(config({ pluginUrl: 'https://p.test/a.zip' }))).pluginUrl).to.equal(
        'https://p.test/a.zip'
      );
      expect(JSON.parse(JSON.stringify(config({})))).to.not.have.property('pluginUrl');
    });
  });

  describe('identity', () => {
    it('resolves every file to its site URL and the address to its origin', () => {
      const portal = config({
        site: { name: 'My API', url: 'https://docs.example.com/', description: 'Docs' },
        brand: {
          logo: { light: 'static/images/logo.png', dark: 'static/images/logo-dark.png' },
          favicon: 'static/favicon.svg',
          colorMode: 'dark'
        },
        navigation: {
          links: [
            { label: 'Status', url: 'https://status.example.com' },
            { label: 'Changelog', url: '/changelog' }
          ]
        },
        ai: { pageActions: false }
      });

      expect(portal.identity()).to.deep.equal({
        name: 'My API',
        description: 'Docs',
        siteUrl: 'https://docs.example.com',
        logo: { light: '/images/logo.png', dark: '/images/logo-dark.png' },
        favicon: { url: '/favicon.svg', type: 'image/svg+xml' },
        colorMode: 'dark',
        links: [
          { label: 'Status', url: 'https://status.example.com', external: true },
          { label: 'Changelog', url: '/changelog', external: false }
        ],
        pageActions: false,
        analytics: {
          googleTagManager: null,
          googleAnalytics: null,
          googleConsentMode: null,
          keepQueryParams: [],
          eventFeed: 'on'
        },
        seo: { googleSiteVerification: null },
        scripts: []
      });
    });

    it('reports absent settings as null rather than leaving them out', () => {
      expect(PortalConfig.scaffolded({ name: 'My API', description: null }).identity()).to.deep.equal({
        name: 'My API',
        description: null,
        siteUrl: null,
        logo: null,
        favicon: null,
        colorMode: 'both',
        links: [],
        pageActions: true,
        analytics: {
          googleTagManager: null,
          googleAnalytics: null,
          googleConsentMode: null,
          keepQueryParams: [],
          eventFeed: 'on'
        },
        seo: { googleSiteVerification: null },
        scripts: []
      });
    });

    // One image serves both modes, so the browser is told the same address twice rather than
    // having to know that a missing dark variant means the light one.
    it('names one logo for both modes when the block names one', () => {
      expect(config({ brand: { logo: 'static/logo.svg' } }).identity().logo).to.deep.equal({
        light: '/logo.svg',
        dark: '/logo.svg'
      });
    });

    it('takes the favicon from the light logo when the block names none', () => {
      const favicon = config({ brand: { logo: { light: 'static/light.png', dark: 'static/dark.png' } } }).identity()
        .favicon;

      expect(favicon).to.deep.equal({ url: '/light.png', type: 'image/png' });
    });

    it('types the favicon by its extension, whatever its case, and leaves an unknown one untyped', () => {
      const typeOf = (favicon: string) => config({ brand: { favicon } }).identity().favicon?.type;

      expect(typeOf('static/favicon.ICO')).to.equal('image/x-icon');
      expect(typeOf('static/icons/app.jpeg')).to.equal('image/jpeg');
      expect(typeOf('static/favicon.bmp')).to.be.null;
      expect(typeOf('static/favicon')).to.be.null;
      // A leading dot names a hidden file, not an extension.
      expect(typeOf('static/.png')).to.be.null;
    });
  });

  describe('scaffolded', () => {
    it('spells out every default, so the block shows what can be set', () => {
      expect(JSON.parse(JSON.stringify(PortalConfig.scaffolded(suggested)))).to.deep.equal({
        site: { name: 'Spec Title', description: 'What the spec says.' },
        brand: { colors: {}, colorMode: 'both' },
        navigation: { links: [] },
        ai: { pageActions: true }
      });
    });

    // An explicit default and an absent key have to produce the same portal.
    it('writes a block that reads back as the portal an empty block makes', () => {
      const written = JSON.parse(JSON.stringify(PortalConfig.scaffolded(suggested)));

      expect(JSON.stringify(config(written, null))).to.equal(JSON.stringify(config({})));
    });

    it('serialises what the block was given, as written', () => {
      const block = {
        site: { name: 'Calc', url: 'https://docs.test' },
        brand: {
          logo: { light: './static/light.svg', dark: 'static/dark.svg' },
          favicon: 'static/favicon.ico',
          colors: { primary: '#1d4ed8' },
          colorMode: 'light'
        },
        navigation: { links: [{ label: 'Status', url: 'https://status.test' }] },
        ai: { pageActions: false }
      };

      expect(JSON.parse(JSON.stringify(config(block, null)))).to.deep.equal(block);
    });
  });
});
