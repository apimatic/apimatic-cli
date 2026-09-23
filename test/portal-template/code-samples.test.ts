import { expect } from 'chai';
import type { CodeUsageGenerator } from 'fumadocs-openapi/requests/generators';
import { tabContent, usageTabs } from '../../portal-template/src/lib/code-samples';

const curl: CodeUsageGenerator = { lang: 'bash', label: 'cURL', generate: () => 'curl code' };
const generators = () => new Map([['curl', curl]]);

const operation = {
  'x-apimatic-codeSamples': [
    { lang: 'typescript', label: 'TypeScript', sources: { minimal: 'ts minimal', full: 'ts full' } },
    { lang: 'python', label: 'Python', sources: { minimal: 'py minimal', full: 'py full' } }
  ]
};

const tab = (sample: object) => usageTabs(new Map(), { 'x-apimatic-codeSamples': [sample] })[0][1];

describe('usageTabs', () => {
  it('puts the generators first, then a tab per extension language holding its snippets', () => {
    const tabs = usageTabs(generators(), operation);

    expect(tabs.map(([id, t]) => [id, t.label])).to.deep.equal([
      ['curl', 'cURL'],
      ['typescript', 'TypeScript'],
      ['python', 'Python']
    ]);
    expect(tabs[1][1]).to.deep.include({ sources: { minimal: 'ts minimal', full: 'ts full' } });
  });

  it('labels a tab with its language when the entry gives no label', () => {
    expect(tab({ lang: 'go', sources: {} }).label).to.equal('go');
  });

  it('lets an entry replace the generator tab whose id it names', () => {
    const tabs = usageTabs(generators(), {
      'x-apimatic-codeSamples': [{ id: 'curl', lang: 'bash', label: 'cURL', sources: { minimal: 'curl minimal' } }]
    });

    expect(tabs).to.have.length(1);
    expect(tabs[0][1]).to.not.have.property('generator');
  });

  it('returns the generators alone for an operation without the extension', () => {
    expect(usageTabs(generators(), {}).map(([id]) => id)).to.deep.equal(['curl']);
    expect(usageTabs(generators(), undefined).map(([id]) => id)).to.deep.equal(['curl']);
  });

  it('ignores x-codeSamples', () => {
    const tabs = usageTabs(generators(), { 'x-codeSamples': [{ lang: 'go', source: 'go code' }] });

    expect(tabs.map(([id]) => id)).to.deep.equal(['curl']);
  });

  it('skips malformed extension entries and keeps the rest', () => {
    const tabs = usageTabs(new Map(), {
      'x-apimatic-codeSamples': [
        { label: 'No language', sources: { minimal: 'x' } },
        { lang: 'go', sources: 'not a map' },
        { lang: 'ruby', sources: { minimal: 42 } },
        { lang: 'php', examples: { minimal: 'the old key' } },
        null,
        { lang: 'java', sources: { minimal: 'java minimal' } }
      ]
    });

    expect(tabs.map(([id]) => id)).to.deep.equal(['java']);
  });

  it('ignores an extension that is not a list', () => {
    expect(usageTabs(generators(), { 'x-apimatic-codeSamples': { lang: 'go' } })).to.have.length(1);
  });
});

describe('tabContent', () => {
  const typescript = usageTabs(new Map(), operation)[0][1];

  it('returns the snippet for the selected example', () => {
    expect(tabContent(typescript, 'full', 2)).to.deep.equal({ kind: 'snippet', source: 'ts full' });
  });

  it('reports a missing sample rather than another example when a dropdown example has no snippet', () => {
    expect(tabContent(typescript, 'bulk', 3)).to.deep.equal({ kind: 'missing' });
  });

  it('uses the only snippet without a dropdown, whatever its key', () => {
    const sole = tab({ lang: 'go', sources: { Example: 'go code' } });

    expect(tabContent(sole, '_default', 1)).to.deep.equal({ kind: 'snippet', source: 'go code' });
  });

  it('reports a missing sample without a dropdown when several snippets leave the choice open', () => {
    expect(tabContent(typescript, '_default', 1)).to.deep.equal({ kind: 'missing' });
  });

  it('generates the code for a generator tab', () => {
    const [, curlTab] = usageTabs(generators(), operation)[0];

    expect(tabContent(curlTab, 'full', 2)).to.deep.equal({ kind: 'generated' });
  });
});
