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

      expect(portal.siteTitle()).to.equal('Spec Title');
      expect(portal.siteDescription()).to.equal('What the spec says.');
      expect(portal.siteOrigin()).to.be.null;
      expect(portal.brandSettings().logoImages()).to.be.null;
      expect(portal.brandSettings().faviconImage()).to.be.null;
      expect(portal.brandSettings().brandColors().primaryColors()).to.be.null;
      expect(portal.brandSettings().mode()).to.equal('both');
      expect(portal.navigationSettings().headerLinks()).to.be.empty;
      expect(portal.apiSettings().grouping()).to.equal('tag');
      expect(portal.apiSettings().showsDeprecated()).to.be.true;
      expect(portal.apiSettings().showsInternal()).to.be.false;
      expect(portal.aiSettings().offersPageActions()).to.be.true;
      expect(portal.tokenOverrides().lightTokens().size).to.equal(0);
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
          api: { hideInternal: true }
        })
      ).to.deep.equal([
        "'portal.theme' is not a 'portal' setting.",
        "'portal.site.title' is not a 'portal' setting.",
        "'portal.brand.colors.accent' is not a 'portal' setting.",
        "'portal.api.hideInternal' is not a 'portal' setting."
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
        site: { name: '', url: 'https://x.test/docs' },
        brand: { colorMode: 'sepia' },
        api: { groupBy: 'path' }
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
      expect(config({ site: { name: 'Calc' } }, null).siteDescription()).to.be.null;
    });

    it('trims the description', () => {
      expect(config({ site: { description: '  Docs  ' } }).siteDescription()).to.equal('Docs');
    });

    // Blank is how the block turns the specification's description off.
    it('treats a blank description as none, not as absent', () => {
      for (const description of ['', '   ', '\n\t']) {
        expect(config({ site: { description } }).siteDescription(), JSON.stringify(description)).to.be.null;
      }
    });

    it('refuses a description that is not a string', () => {
      expect(errorsOf({ site: { description: 5 } })).to.deep.equal(["'portal.site.description' must be a string."]);
    });

    it('keeps only the origin of the address, dropping a trailing slash and keeping a port', () => {
      expect(
        config({ site: { url: 'https://docs.example.com/' } })
          .siteOrigin()
          ?.toString()
      ).to.equal('https://docs.example.com');
      expect(
        config({ site: { url: 'https://docs.example.com:8443' } })
          .siteOrigin()
          ?.toString()
      ).to.equal('https://docs.example.com:8443');
    });

    it('refuses an address carrying a path, query or fragment, or one that is not http', () => {
      for (const url of [
        'https://x.test/docs',
        'https://x.test/?a=1',
        'https://x.test/#top',
        'ftp://x.test',
        'x.test',
        'https:x.test',
        ''
      ]) {
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

        expect(logo?.light().siteUrl()).to.equal('/images/logo.png');
        expect(logo?.dark().siteUrl()).to.equal('/images/logo.png');
      });

      it('takes a path per mode', () => {
        const logo = config({ brand: { logo: { light: 'static/light.svg', dark: 'static/dark.svg' } } })
          .brandSettings()
          .logoImages();

        expect(logo?.light().siteUrl()).to.equal('/light.svg');
        expect(logo?.dark().siteUrl()).to.equal('/dark.svg');
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

        expect(logo?.light().siteUrl()).to.equal('/images/logo.png');
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

        expect(logo?.light().siteUrl()).to.equal('/my%20logo%20%231%3F.png');
        expect(logo?.light().resolveIn(source).relativeTo(source)).to.equal('static/my logo #1?.png');
      });
    });

    describe('favicon', () => {
      it('defaults to the light logo', () => {
        const brand = config({
          brand: { logo: { light: 'static/light.svg', dark: 'static/dark.svg' } }
        }).brandSettings();

        expect(brand.faviconImage()?.siteUrl()).to.equal('/light.svg');
      });

      it('is the file the block names when it names one', () => {
        const brand = config({ brand: { logo: 'static/logo.svg', favicon: 'static/favicon.ico' } }).brandSettings();

        expect(brand.faviconImage()?.siteUrl()).to.equal('/favicon.ico');
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
        "'portal.brand.colorMode' must be one of 'light', 'dark', 'both'."
      ]);
    });
  });

  describe('navigation', () => {
    it('marks a link to another site external and a page of the portal not', () => {
      const links = config({
        navigation: {
          links: [
            { label: 'Status', url: 'https://status.example.com' },
            { label: 'Auth', url: '/authentication' }
          ]
        }
      })
        .navigationSettings()
        .headerLinks();

      expect(links.map((link) => [link.text(), link.href(), link.isExternal()])).to.deep.equal([
        ['Status', 'https://status.example.com', true],
        ['Auth', '/authentication', false]
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

    it('writes a page of the portal as the browser resolves it', () => {
      const [link] = config({ navigation: { links: [{ label: 'x', url: '/guides/../start here?tab=1#top' }] } })
        .navigationSettings()
        .headerLinks();

      expect(link.href()).to.equal('/start%20here?tab=1#top');
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

  describe('api', () => {
    it('takes Fumadocs’ grouping values and the two filters', () => {
      const api = config({ api: { groupBy: 'route', showDeprecated: false, showInternal: true } }).apiSettings();

      expect([api.grouping(), api.showsDeprecated(), api.showsInternal()]).to.deep.equal(['route', false, true]);
      expect(errorsOf({ api: { groupBy: 'path', showDeprecated: 'no' } })).to.deep.equal([
        "'portal.api.groupBy' must be one of 'tag', 'route', 'none'.",
        "'portal.api.showDeprecated' must be true or false."
      ]);
    });
  });

  describe('ai', () => {
    // Each page offers to open itself in ChatGPT, Claude, Cursor or Scira. A portal
    // published under someone else's brand carries that endorsement, so it can be refused.
    it('offers the page actions unless the block turns them off', () => {
      expect(
        config({ ai: { pageActions: false } })
          .aiSettings()
          .offersPageActions()
      ).to.be.false;
      expect(errorsOf({ ai: { pageActions: 'no' } })).to.deep.equal(["'portal.ai.pageActions' must be true or false."]);
    });
  });

  describe('advanced tokens', () => {
    it('keeps the overrides per mode, by their full custom-property name', () => {
      const tokens = config({
        advanced: { tokens: { light: { '--color-fd-accent': ' #eee ' }, dark: { '--color-fd-accent': '#222' } } }
      }).tokenOverrides();

      expect([...tokens.lightTokens()]).to.deep.equal([['--color-fd-accent', '#eee']]);
      expect([...tokens.darkTokens()]).to.deep.equal([['--color-fd-accent', '#222']]);
    });

    it('refuses a namespace of the wrong shape, and a key it does not know, at each level', () => {
      expect(errorsOf({ advanced: { tokens: [], css: 'x' } })).to.deep.equal([
        "'portal.advanced.css' is not a 'portal' setting.",
        "'portal.advanced.tokens' must be a JSON object."
      ]);
      expect(errorsOf({ advanced: { tokens: { light: 'x', system: {} } } })).to.deep.equal([
        "'portal.advanced.tokens.system' is not a 'portal' setting.",
        "'portal.advanced.tokens.light' must be a JSON object."
      ]);
    });

    it('refuses a short name, a token set once for both modes, and an empty value', () => {
      const errors = errorsOf({
        advanced: { tokens: { light: { accent: '#eee', '--color-fd-info': 'blue' }, dark: { '--color-fd-ring': '' } } }
      });

      expect(errors).to.have.lengthOf(3);
      expect(errors[0]).to.match(
        /^'portal\.advanced\.tokens\.light\.accent' is not a token the preset sets per colour mode/
      );
      expect(errors[2]).to.equal("'portal.advanced.tokens.dark.--color-fd-ring' must be a non-empty string.");
    });

    // The value is written into the generated stylesheet as it stands. An unclosed parenthesis,
    // bracket or quote, or a trailing backslash, runs on into the next declaration: the build
    // then fails naming no setting, or drops both colour-mode blocks.
    it('refuses a value that would reach past its own declaration', () => {
      const values = [
        'red; x: y',
        'red } body {',
        'red /* note',
        'rgb(10 20 30',
        'url(x',
        'red)',
        '"red',
        "'red'",
        '[a',
        'red\\',
        'red !important',
        'red\nblue'
      ];

      for (const value of values) {
        expect(errorsOf({ advanced: { tokens: { light: { '--color-fd-ring': value } } } }), value).to.deep.equal([
          "'portal.advanced.tokens.light.--color-fd-ring' must be a single CSS value, such as '#1d4ed8' or " +
            "'oklch(0.6 0.2 260)': letters, digits, spaces and '# % . , ( ) / * + - _', with every parenthesis " +
            'closed and no comment.'
        ]);
      }
    });

    it('accepts any CSS colour, including functions of other tokens', () => {
      for (const value of [
        'rgb(0 0 0 / 50%)',
        'transparent',
        'color-mix(in oklab, var(--color-fd-primary) 10%, transparent)',
        'oklch(from var(--color-fd-primary) calc(l * 0.9) c h)',
        'light-dark(#fff, #000)'
      ]) {
        expect(parse({ advanced: { tokens: { dark: { '--color-fd-accent': value } } } }).isOk(), value).to.be.true;
      }
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
        pageActions: false
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
        pageActions: true
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
        api: { groupBy: 'tag', showDeprecated: true, showInternal: false },
        ai: { pageActions: true },
        advanced: { tokens: { light: {}, dark: {} } }
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
        api: { groupBy: 'none', showDeprecated: false, showInternal: true },
        ai: { pageActions: false },
        advanced: { tokens: { light: { '--color-fd-accent': '#eee' }, dark: {} } }
      };

      expect(JSON.parse(JSON.stringify(config(block, null)))).to.deep.equal(block);
    });
  });
});
