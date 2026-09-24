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
import { CodeGenerationVersion, Language } from '../../../src/types/sdk/generate';

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
      ['languages', schema.definitions.languages.propertyNames.enum, Object.values(Language)],
      [
        'languages.*.publishing.codegenVersion',
        schema.definitions.languageEntry.properties.publishing.properties.codegenVersion.enum,
        Object.values(CodeGenerationVersion)
      ]
    ];

    for (const [setting, offered, accepted] of cases) {
      it(`for ${setting}`, () => {
        expect(offered).to.deep.equal([...accepted]);
      });
    }

    it('with an entry for every language', () => {
      expect(Object.keys(schema.definitions.languages.properties)).to.have.members(Object.values(Language));
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
      ['one logo for both modes', { brand: { logo: 'static/images/logo.png' } }],
      ['a logo path with its dots inside a name', { brand: { logo: 'static/..hidden/logo.png' } }],
      ['a three-digit hex primary', { brand: { colors: { primary: ' #FFF ' } } }],
      ['a link with an http address', { navigation: { links: [{ label: 'Old', url: 'http://old.test/docs' }] } }],
      ['a link with a query and a fragment', { navigation: { links: [{ label: 'Tab', url: '/start?tab=1#top' }] } }],
      ['a link through a parent segment', { navigation: { links: [{ label: 'Start', url: '/guides/../start' }] } }],
      ['a link with two slashes in its query', { navigation: { links: [{ label: 'Next', url: '/start?next=//x' }] } }]
    ];

    const invalid: [string, object][] = [
      ['an unknown namespace', { theme: {} }],
      ['a key from the flat block', { title: 'Calc' }],
      ['a namespace that is not an object', { site: 'Calc' }],
      ['an empty name', { site: { name: '' } }],
      ['a blank name', { site: { name: '   ' } }],
      ['a name that is not a string', { site: { name: 7 } }],
      ['an unknown site key', { site: { title: 'Calc' } }],
      ['an address with a path', { site: { url: 'https://x.test/docs' } }],
      ['an address with a query', { site: { url: 'https://x.test/?a=1' } }],
      ['an address with a fragment', { site: { url: 'https://x.test/#top' } }],
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
      ['page actions that are not a boolean', { ai: { pageActions: 'no' } }]
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
        { python: { publishing: { package: { name: 'calc', version: '1.0.0' }, codegenVersion: 'v4' } } }
      ],
      [
        'keys this CLI does not model, beside and inside the record',
        { java: { publishing: { future: 1 }, notes: 'x' } }
      ]
    ];

    const invalid: [string, unknown][] = [
      ['a block that is not an object', 'typescript'],
      ['a key that is no SDK language', { typescipt: {} }],
      ['an entry that is not an object', { go: 'yes' }],
      ['a publishing record that is not an object', { ruby: { publishing: 1 } }]
    ];

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

    // The portal reads only which languages there are; the record is typed for the editor.
    it('types the publishing record, which the portal does not read', () => {
      const languages = { csharp: { publishing: { codegenVersion: 'v9' } } };

      expect(languagesAccepted(languages)).to.be.true;
      expect(schemaVerdict({ languages }).valid).to.be.false;
    });
  });

  describe('is lenient where the file is', () => {
    /** What the document's own checks find, the portal's parser aside. */
    const documentAccepts = (file: object): boolean =>
      ApimaticConfigDocument.parse(JSON.stringify(file))._unsafeUnwrap().findingsFor('root', 'plugin', 'languages')
        .length === 0;

    const cases: [string, object, boolean][] = [
      [
        'unknown root keys and unknown plugin fields',
        {
          $schema: APIMATIC_SCHEMA_URL,
          schemaVersion: 1,
          future: { anything: true },
          portal: {},
          plugin: { pluginId: 'acme-payments', pluginVersion: '0.1.0', notes: 'kept' },
          languages: { typescript: {} }
        },
        true
      ],
      ['a file whose only language entry is empty', { languages: { typescript: {} } }, true],
      ['a file with nothing in it', {}, true],
      ['another schema version', { schemaVersion: 2 }, false],
      ['a plugin ID with spaces', { plugin: { pluginId: 'Acme Payments' } }, false],
      ['a plugin version that is not major.minor.patch', { plugin: { pluginVersion: '1.0' } }, false]
    ];

    for (const [label, file, accepted] of cases) {
      it(`${accepted ? 'accepts' : 'refuses'} ${label}`, () => {
        expect(documentAccepts(file), 'document').to.equal(accepted);
        const verdict = schemaVerdict(file);
        expect(verdict.valid, verdict.errors || 'schema').to.equal(accepted);
      });
    }
  });
});
