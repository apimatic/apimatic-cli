import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';
import { expect } from 'chai';
import {
  APIMATIC_SCHEMA_URL,
  ApimaticConfigDocument,
  SCHEMA_VERSION
} from '../../../src/types/apimatic-config/document';
import { COLOR_MODES } from '../../../src/types/portal/config/brand-config';
import { PortalConfig } from '../../../src/types/portal/portal-config';
import { PortalLanguages } from '../../../src/types/portal/portal-languages';
import { AVAILABLE_LANGUAGES, Language } from '../../../src/types/sdk/generate';
import { buildLanguageEntry } from '../../../src/types/apimatic-config/languages-block';
import { PackageConfigurationForLanguage } from '../../../src/types/publish/package-settings-configuration';
import { SemVersion } from '../../../src/types/publish/version';

/** As much of a schema object as the walks below read. */
interface SchemaNode {
  properties?: Record<string, SchemaNode & { default?: unknown }>;
}

const repositoryRoot = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'apimatic.schema.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));

describe('apimatic.schema.json', () => {
  // Strict mode refuses unknown keywords and loose types, so a typo in the schema fails here
  // rather than silently validating nothing in an editor.
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);

  /** Whether the schema accepts a whole file, with its complaints when it does not. */
  const schemaVerdict = (file: unknown): { valid: boolean; errors: string } => {
    const valid = validate(file) === true;
    return { valid, errors: valid ? '' : ajv.errorsText(validate.errors) };
  };

  const suggested = { name: 'Spec Title', description: null };

  /** What the portal commands make of a block, name requirement aside: the schema cannot count specs. */
  const portalAccepts = (block: unknown): boolean =>
    PortalConfig.fromBlock(JSON.parse(JSON.stringify(block)), suggested).isOk();

  /** What the portal commands make of a languages block, read through the document as they read it. */
  const languagesAccepted = (languages: unknown): boolean => {
    const document = ApimaticConfigDocument.parse(JSON.stringify({ languages }))._unsafeUnwrap();
    return PortalLanguages.fromBlock(document.languages(), document.findingsFor('languages')).isOk();
  };

  it('is published with the package, at the address the CLI names', () => {
    expect(manifest.files).to.include('/apimatic.schema.json');
    expect(schema.$id).to.equal(APIMATIC_SCHEMA_URL);
  });

  it('accepts the schema version the CLI reads, and no other', () => {
    expect(schema.properties.schemaVersion.const).to.equal(SCHEMA_VERSION);
  });

  describe('offers exactly the values the parsers accept', () => {
    const portal = schema.definitions.portal.properties;
    const brand = portal.brand.properties;

    const cases: [string, unknown, readonly string[]][] = [
      ['brand.colorMode', brand.colorMode.enum, COLOR_MODES],
      ['languages', schema.definitions.languages.propertyNames.enum, AVAILABLE_LANGUAGES]
    ];

    for (const [setting, offered, accepted] of cases) {
      it(`for ${setting}`, () => {
        expect(offered).to.deep.equal([...accepted]);
      });
    }

    // The schema declares what the CLI can write, so a language joining `CODEGEN_OPTIONS` fails
    // here until its entry is declared, rather than in the editor of whoever publishes it first.
    it('with an entry for every language the CLI can generate, and no other', () => {
      expect(Object.keys(schema.definitions.languages.properties)).to.have.members([...AVAILABLE_LANGUAGES]);
    });
  });

  describe('agrees with the parser on the portal block', () => {
    const valid: [string, object][] = [
      ['an empty block', {}],
      ['the block quickstart writes', PortalConfig.scaffolded({ name: 'Calc', description: 'Adds.' }).toJSON()],
      [
        'every setting at once',
        {
          site: { name: 'Calc', url: 'https://docs.test/', description: '' },
          brand: {
            logo: { light: 'static/light.svg', dark: '.\\static\\dark.svg' },
            favicon: './static/favicon.ico',
            colors: { primary: { light: '#1d4ed8', dark: '#93c5fd' } },
            colorMode: 'dark'
          },
          navigation: {
            links: [
              { label: 'Status', url: 'https://status.test' },
              { label: 'Home', url: '/' }
            ]
          },
          ai: { pageActions: false }
        }
      ],
      ['an address with a port', { site: { url: 'https://docs.example.com:8443' } }],
      ['an address with a path', { site: { url: 'https://x.test/docs' } }],
      ['an address with a path and a trailing slash', { site: { url: 'https://x.test/docs/ ' } }],
      ['an address with a deeper path in any case', { site: { url: 'HTTPS://x.test/Docs/v2.1/api_ref~x-y' } }],
      ['an address with a path of dots alone', { site: { url: 'https://x.test/...' } }],
      ['one logo for both modes', { brand: { logo: 'static/images/logo.png' } }],
      ['a logo path with its dots inside a name', { brand: { logo: 'static/..hidden/logo.png' } }],
      ['a three-digit hex primary', { brand: { colors: { primary: ' #FFF ' } } }],
      ['a link with an http address', { navigation: { links: [{ label: 'Old', url: 'http://old.test/docs' }] } }],
      ['a link with a query and a fragment', { navigation: { links: [{ label: 'Tab', url: '/start?tab=1#top' }] } }],
      ['a link through a parent segment', { navigation: { links: [{ label: 'Start', url: '/guides/../start' }] } }],
      ['a link with two slashes in its query', { navigation: { links: [{ label: 'Next', url: '/start?next=//x' }] } }],
      ['a context plugin hosted elsewhere', { pluginUrl: 'https://plugins.acme.test/calc.zip?v=2' }],
      ['a plugin address with several query parameters', { pluginUrl: 'https://s3.test/calc.zip?a=1&b=2' }]
    ];

    const invalid: [string, object][] = [
      ['an unknown namespace', { theme: {} }],
      ['a key from the flat block', { title: 'Calc' }],
      ['a namespace that is not an object', { site: 'Calc' }],
      ['an empty name', { site: { name: '' } }],
      ['a blank name', { site: { name: '   ' } }],
      ['a name that is not a string', { site: { name: 7 } }],
      ['an unknown site key', { site: { title: 'Calc' } }],
      ['an address with a query', { site: { url: 'https://x.test/?a=1' } }],
      ['an address with an empty query', { site: { url: 'https://x.test/docs?' } }],
      ['an address with a fragment', { site: { url: 'https://x.test/#top' } }],
      ['an address with an empty fragment', { site: { url: 'https://x.test/docs#' } }],
      ['an address with a backslash in its path', { site: { url: 'https://x.test/docs\\guides' } }],
      ['an address with a backslash for its path', { site: { url: 'https://x.test\\docs' } }],
      ['an address with a dot segment', { site: { url: 'https://x.test/docs/.' } }],
      ['an address with a parent segment', { site: { url: 'https://x.test/docs/..' } }],
      ['an address with a dot segment before trailing space', { site: { url: 'https://x.test/docs/. ' } }],
      ['an address with an empty segment', { site: { url: 'https://x.test/docs//x' } }],
      ['an address whose path starts with two slashes', { site: { url: 'https://x.test//docs' } }],
      ['an address with an encoded path', { site: { url: 'https://x.test/my%20docs' } }],
      ['an address with a space in its path', { site: { url: 'https://x.test/my docs' } }],
      ['an address that is not http', { site: { url: 'ftp://x.test' } }],
      ['an address without a scheme', { site: { url: 'x.test' } }],
      ['a description that is not a string', { site: { description: 5 } }],
      ['a logo outside static', { brand: { logo: 'images/logo.png' } }],
      ['the static directory itself', { brand: { logo: 'static/' } }],
      ['a logo escaping static', { brand: { logo: 'static/../secret.png' } }],
      ['a logo path with a name missing', { brand: { logo: 'static//logo.png' } }],
      ['a logo path with a name missing between backslashes', { brand: { logo: 'static\\\\logo.png' } }],
      ['a logo path through the directory it names', { brand: { logo: 'static/./logo.png' } }],
      ['a logo path to a directory', { brand: { logo: 'static/images/' } }],
      ['a logo path with a blank name in it', { brand: { logo: 'static/ /logo.png' } }],
      ['an empty logo', { brand: { logo: '' } }],
      ['a logo that is a number', { brand: { logo: 7 } }],
      ['a logo pair missing a mode', { brand: { logo: { light: 'static/a.svg' } } }],
      [
        'a logo pair with an unknown key',
        { brand: { logo: { light: 'static/a.svg', dark: 'static/b.svg', auto: 'x' } } }
      ],
      ['a favicon outside static', { brand: { favicon: 'favicon.ico' } }],
      ['a named colour', { brand: { colors: { primary: 'blue' } } }],
      ['an oklch colour', { brand: { colors: { primary: 'oklch(0.5 0.2 240)' } } }],
      ['a four-digit hex colour', { brand: { colors: { primary: '#fffa' } } }],
      ['an eight-digit hex colour', { brand: { colors: { primary: '#1D4ED8cc' } } }],
      ['an rgb colour', { brand: { colors: { primary: 'rgb(29 78 216)' } } }],
      ['an hsl colour', { brand: { colors: { primary: 'hsl(221, 83%, 53%)' } } }],
      ['an unknown colour key', { brand: { colors: { accent: '#fff' } } }],
      ['an unknown colour mode', { brand: { colorMode: 'auto' } }],
      ['links that are not a list', { navigation: { links: {} } }],
      ['a link that is a string', { navigation: { links: ['Status'] } }],
      ['a link without an address', { navigation: { links: [{ label: 'x' }] } }],
      ['a mailto link', { navigation: { links: [{ label: 'x', url: 'mailto:docs@example.com' }] } }],
      ['a relative link', { navigation: { links: [{ label: 'x', url: 'docs/x' }] } }],
      ['a javascript link', { navigation: { links: [{ label: 'x', url: 'javascript:alert(1)' }] } }],
      ['a protocol-relative link', { navigation: { links: [{ label: 'x', url: '//example.com' }] } }],
      [
        'a link to another host through a backslash',
        { navigation: { links: [{ label: 'x', url: '/\\example.com' }] } }
      ],
      ['a link to another host through a tab', { navigation: { links: [{ label: 'x', url: '/\t/example.com' }] } }],
      ['a link with an empty segment', { navigation: { links: [{ label: 'x', url: '/docs//page' }] } }],
      [
        'a link to another host past a dot segment',
        { navigation: { links: [{ label: 'x', url: '/.//example.com' }] } }
      ],
      [
        'a link to another host past a parent segment',
        { navigation: { links: [{ label: 'x', url: '/..//example.com' }] } }
      ],
      [
        'a link to another host past an encoded dot segment',
        { navigation: { links: [{ label: 'x', url: '/%2e//example.com' }] } }
      ],
      [
        'a link to another host past a page it leaves',
        { navigation: { links: [{ label: 'x', url: '/docs/..//example.com' }] } }
      ],
      [
        'a link to another host past a dot segment and a tab',
        { navigation: { links: [{ label: 'x', url: '/.\t//example.com' }] } }
      ],
      [
        'a link without the slashes of its scheme',
        { navigation: { links: [{ label: 'x', url: 'https:example.com' }] } }
      ],
      ['an address without the slashes of its scheme', { site: { url: 'https:x.test' } }],
      ['an empty link', { navigation: { links: [{ label: 'x', url: '' }] } }],
      ['a blank link label', { navigation: { links: [{ label: ' ', url: '/' }] } }],
      ['a link with an unknown key', { navigation: { links: [{ label: 'x', url: '/', icon: 'x' }] } }],
      ['page actions that are not a boolean', { ai: { pageActions: 'no' } }],
      ['a plugin address over http', { pluginUrl: 'http://plugins.acme.test/calc.zip' }],
      ['a plugin address on the portal itself', { pluginUrl: '/__downloads/plugin.zip' }],
      ['a plugin address without a host', { pluginUrl: 'https://' }],
      ['a plugin address that is not a string', { pluginUrl: 7 }],
      ['a plugin address with a space', { pluginUrl: 'https://plugins.acme.test/my plugin.zip' }],
      ['a plugin address with trailing whitespace', { pluginUrl: 'https://plugins.acme.test/calc.zip ' }]
    ];

    for (const [label, block] of valid) {
      it(`accepts ${label}`, () => {
        expect(portalAccepts(block), 'parser').to.be.true;
        const verdict = schemaVerdict({ portal: block });
        expect(verdict.valid, verdict.errors).to.be.true;
      });
    }

    for (const [label, block] of invalid) {
      it(`refuses ${label}`, () => {
        expect(portalAccepts(block), 'parser').to.be.false;
        expect(schemaVerdict({ portal: block }).valid, 'schema').to.be.false;
      });
    }

    it('offers the defaults the parser applies', () => {
      // The scaffolded block spells out every default, and reads back as the portal an empty
      // block makes.
      const applied = PortalConfig.scaffolded(suggested).toJSON() as unknown as Record<string, unknown>;
      const defaults: [string, unknown][] = [];
      const collect = (node: SchemaNode, path: string[]) => {
        for (const [key, property] of Object.entries(node.properties ?? {})) {
          if ('default' in property) {
            defaults.push([[...path, key].join('.'), property.default]);
          }
          collect(property, [...path, key]);
        }
      };
      collect(schema.definitions.portal, []);

      expect(defaults.map(([setting]) => setting)).to.include.members(['brand.colorMode', 'ai.pageActions']);
      for (const [setting, value] of defaults) {
        const actual = setting
          .split('.')
          .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], applied);
        expect(actual, setting).to.deep.equal(value);
      }
    });

    // The other way round is covered by the scaffold, which writes every setting that has a
    // default into a file the schema has to accept.
    it('names only settings the parser knows', () => {
      const settings: string[][] = [];
      const collect = (node: SchemaNode, path: string[]) => {
        for (const [key, property] of Object.entries(node.properties ?? {})) {
          settings.push([...path, key]);
          collect(property, [...path, key]);
        }
      };
      collect(schema.definitions.portal, []);

      expect(settings).to.have.length.greaterThan(10);
      for (const setting of settings) {
        const block = setting.reduceRight<unknown>((value, key) => ({ [key]: value }), { probe: true });
        const errors = PortalConfig.fromBlock(block, suggested).match(
          () => [],
          (found) => found
        );
        expect(errors, setting.join('.')).to.not.include(`'portal.${setting.join('.')}' is not a 'portal' setting.`);
      }
    });

    // Counting the specifications is the command's to do, so the name is optional here.
    it('leaves the name to the command when there are several specifications', () => {
      expect(schemaVerdict({ portal: {} }).valid).to.be.true;
      expect(PortalConfig.fromBlock({}, null).isErr()).to.be.true;
    });
  });

  describe('agrees with the portal on the languages block', () => {
    const valid: [string, object][] = [
      ['a language wanted but not yet published', { typescript: {} }],
      [
        'a published language',
        { python: { publishing: { package: { version: '1.0.0' }, packageConfiguration: { name: 'calc' } } } }
      ],
      // The record a source-only publish writes. apimatic/apimatic-io#2240.
      [
        'a repository with no release',
        { typescript: { publishing: { source: { repositoryUrl: 'https://github.com/acme/calc', branch: 'main' } } } }
      ],
      [
        'package settings without a release',
        { csharp: { publishing: { packageConfiguration: { packageId: 'Acme.Calc' } } } }
      ]
    ];

    const invalid: [string, unknown][] = [
      ['a block that is not an object', 'typescript'],
      ['a key that is no SDK language', { typescipt: {} }],
      ['an entry that is not an object', { csharp: 'yes' }],
      ['a publishing record that is not an object', { python: { publishing: 1 } }]
    ];

    // The name the SDK card installs is in `packageConfiguration`, so a release without one has no
    // package to name — the rejection the portal build reports. apimatic/apimatic-io#2240.
    it('asks for the package settings a release is named by', () => {
      const languages = { typescript: { publishing: { package: { version: '1.0.0' } } } };

      expect(schemaVerdict({ languages }).valid, 'schema').to.be.false;
    });

    // Each language names its package in its own field, and the schema asks for the one its
    // settings reader refuses to map without. Java, PHP, Ruby and Go have no reader, so none.
    const identity: [string, object][] = [
      ['csharp', { packageId: 'Acme.Calc' }],
      ['typescript', { name: '@acme/calc' }],
      ['python', { name: 'acme-calc' }]
    ];

    for (const [language, packageConfiguration] of identity) {
      it(`asks ${language} to name its package`, () => {
        const release = { package: { version: '1.0.0' } };

        expect(schemaVerdict({ languages: { [language]: { publishing: { ...release, packageConfiguration } } } }).valid)
          .to.be.true;
        expect(
          schemaVerdict({ languages: { [language]: { publishing: { ...release, packageConfiguration: {} } } } }).valid
        ).to.be.false;
      });
    }

    // The editor asks for what the portal build requires, as it does for the plugin's identity;
    // the parser stays lenient, so a file another APIMatic tool wrote is still read.
    const unknownKey: [string, object][] = [
      ['an entry', { csharp: { notes: 'x' } }],
      ['a publishing record', { csharp: { publishing: { future: 1 } } }],
      [
        'a source',
        { csharp: { publishing: { source: { repositoryUrl: 'https://github.com/acme/calc', tag: 'v1' } } } }
      ],
      ['a release', { csharp: { publishing: { package: { version: '1.0.0', name: 'Acme.Calc' } } } }],
      [
        'package settings',
        { csharp: { publishing: { packageConfiguration: { packageId: 'Acme.Calc', licence: 'MIT' } } } }
      ]
    ];

    for (const [label, languages] of unknownKey) {
      it(`refuses a key this CLI does not write in ${label}, which the file is still read with`, () => {
        expect(languagesAccepted(languages), 'portal').to.be.true;
        expect(schemaVerdict({ languages }).valid, 'schema').to.be.false;
      });
    }

    for (const [label, languages] of valid) {
      it(`accepts ${label}`, () => {
        expect(languagesAccepted(languages), 'portal').to.be.true;
        const verdict = schemaVerdict({ languages });
        expect(verdict.valid, verdict.errors).to.be.true;
      });
    }

    for (const [label, languages] of invalid) {
      it(`refuses ${label}`, () => {
        expect(languagesAccepted(languages), 'portal').to.be.false;
        expect(schemaVerdict({ languages }).valid, 'schema').to.be.false;
      });
    }

    // A file `sdk publish` alone wrote is valid; needing a language is the portal command's rule.
    it('leaves the one-language minimum to the portal command', () => {
      expect(schemaVerdict({ languages: {} }).valid).to.be.true;
      expect(languagesAccepted({})).to.be.false;
    });

    // Nothing generates these yet, so nothing writes them: `sdk generate` refuses a language
    // outside `CODEGEN_OPTIONS`, and a publish records only what it generated.
    for (const language of ['java', 'php', 'ruby', 'go']) {
      it(`refuses ${language}, which nothing can generate yet`, () => {
        const languages = { [language]: {} };

        expect(schemaVerdict({ languages }).valid, 'schema').to.be.false;
        expect(languagesAccepted(languages), 'portal').to.be.false;
      });
    }

    // The portal reads the record leniently, as not recorded where it has the wrong shape; the
    // schema types it for the editor.
    it('types the publishing record, which the portal reads leniently', () => {
      const languages = { csharp: { publishing: { source: 'github.com/acme/calc' } } };

      expect(languagesAccepted(languages)).to.be.true;
      expect(schemaVerdict({ languages }).valid).to.be.false;
    });
  });

  // What #2253 was: the schema described a shape `sdk publish` never writes, and never described
  // the one it does. Every field is given, so a field the CLI writes and the schema leaves out
  // fails here rather than in a user's editor.
  describe('accepts what `sdk publish` writes', () => {
    const person = { name: 'Acme', email: 'dev@acme.io', url: null };

    const publishable = [Language.CSHARP, Language.TYPESCRIPT, Language.PYTHON] as const;

    it('covers every language the CLI can generate', () => {
      expect([...publishable]).to.have.members([...AVAILABLE_LANGUAGES]);
    });

    const configurations: { [L in (typeof publishable)[number]]: PackageConfigurationForLanguage[L] } = {
      [Language.CSHARP]: {
        packageId: 'Acme.Calc',
        authors: 'Acme',
        description: null,
        title: null,
        packageTags: null,
        repositoryUrl: null,
        repositoryType: null,
        packageProjectUrl: null,
        packageIcon: null,
        packageReleaseNotes: null,
        copyright: null
      },
      [Language.PYTHON]: {
        name: 'acme-calc',
        description: null,
        authors: [{ email: null, name: 'Acme' }],
        maintainers: [],
        keywords: ['sdk'],
        classifiers: [],
        urls: { Homepage: 'https://acme.io' }
      },
      [Language.TYPESCRIPT]: {
        name: '@acme/calc',
        author: person,
        description: null,
        contributors: [person],
        bugs: { url: null, email: null },
        keywords: ['sdk'],
        homepage: null,
        repository: { type: null, url: null, directory: null }
      }
    };

    const gitConfiguration = { isEnabled: true, credentialsId: 'creds', repositoryName: 'acme/calc', branch: 'main' };
    const version = SemVersion.tryCreate('1.0.0')._unsafeUnwrap();

    for (const language of publishable) {
      it(`the record a ${language} publish records`, () => {
        const entry = buildLanguageEntry(language, gitConfiguration, configurations[language], version);
        const file = JSON.parse(JSON.stringify({ languages: { [language]: entry } }));

        const verdict = schemaVerdict(file);
        expect(verdict.valid, verdict.errors).to.be.true;
      });

      it(`the record a ${language} source-only publish records`, () => {
        const entry = buildLanguageEntry(language, gitConfiguration, undefined, undefined);
        const file = JSON.parse(JSON.stringify({ languages: { [language]: entry } }));

        const verdict = schemaVerdict(file);
        expect(verdict.valid, verdict.errors).to.be.true;
      });
    }
  });

  describe('is lenient where the file is', () => {
    /** What the document's own checks find, the portal's parser aside. */
    const documentAccepts = (file: object): boolean =>
      ApimaticConfigDocument.parse(JSON.stringify(file))._unsafeUnwrap().findingsFor('root', 'plugin', 'languages')
        .length === 0;

    const identity = { pluginId: 'acme-payments', pluginName: 'Acme Payments', pluginVersion: '0.1.0' };

    const cases: [string, object, boolean][] = [
      [
        'unknown root keys and unknown plugin fields',
        {
          $schema: APIMATIC_SCHEMA_URL,
          schemaVersion: 1,
          future: { anything: true },
          portal: {},
          plugin: { ...identity, notes: 'kept' },
          languages: { typescript: {} }
        },
        true
      ],
      ['a file whose only language entry is empty', { languages: { typescript: {} } }, true],
      ['a file with nothing in it', {}, true],
      ['another schema version', { schemaVersion: 2 }, false],
      ['a plugin ID with spaces', { plugin: { ...identity, pluginId: 'Acme Payments' } }, false],
      ['a plugin version that is not major.minor.patch', { plugin: { ...identity, pluginVersion: '1.0' } }, false]
    ];

    for (const [label, file, accepted] of cases) {
      it(`${accepted ? 'accepts' : 'refuses'} ${label}`, () => {
        expect(documentAccepts(file), 'document').to.equal(accepted);
        const verdict = schemaVerdict(file);
        expect(verdict.valid, verdict.errors || 'schema').to.equal(accepted);
      });
    }

    // The service generates no plugin without its ID, name and version, so the editor asks for
    // them. The file is still read without them: `plugin generate` asks for a missing ID or name.
    const incomplete: [string, object][] = [
      ['an empty plugin block', {}],
      ['a plugin without an ID', { pluginName: identity.pluginName, pluginVersion: identity.pluginVersion }],
      ['a plugin without a name', { pluginId: identity.pluginId, pluginVersion: identity.pluginVersion }],
      ['a plugin with a blank name', { ...identity, pluginName: ' ' }],
      ['a plugin without a version', { pluginId: identity.pluginId, pluginName: identity.pluginName }]
    ];

    for (const [label, plugin] of incomplete) {
      it(`asks for the identity in ${label}, which the file is still read without`, () => {
        expect(documentAccepts({ plugin }), 'document').to.be.true;
        expect(schemaVerdict({ plugin }).valid, 'schema').to.be.false;
      });
    }
  });
});
