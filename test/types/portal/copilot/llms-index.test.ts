import { expect } from 'chai';
import { SiteAddress } from '../../../../src/types/portal/config/site-address';
import { listedPages } from '../../../../src/types/portal/copilot/llms-index';

const underDocs = SiteAddress.parse('https://example.com/docs', 'url')._unsafeUnwrap();

describe('listedPages', () => {
  it('reads every linked page with its title and description, in the order llms.txt lists them', () => {
    const llmsTxt = [
      '# Acme',
      '',
      '> The Acme API.',
      '- [Welcome](/): Start here',
      '  - [ Intro ](/guides/intro)',
      '* [Errors](/api/errors): What can go wrong'
    ].join('\r\n');

    expect(listedPages(llmsTxt, null)).to.deep.equal([
      { path: '/', title: 'Welcome', description: 'Start here' },
      { path: '/guides/intro', title: 'Intro', description: null },
      { path: '/api/errors', title: 'Errors', description: 'What can go wrong' }
    ]);
  });

  it('addresses pages from the base path, leaving out those outside it', () => {
    const llmsTxt = [
      '- [Docs](/docs)',
      '- [Intro](/docs/guides/intro/)',
      '- [Blog](/blog/post)',
      '- [Search](/docsearch)'
    ].join('\n');

    expect(listedPages(llmsTxt, underDocs).map((page) => page.path)).to.deep.equal(['/', '/guides/intro']);
  });

  it('lists a page once, by its address without query or fragment', () => {
    const llmsTxt = ['- [Intro](/guides/intro?tab=ts)', '- [Intro again](/guides/intro#install)'].join('\n');

    expect(listedPages(llmsTxt, null)).to.deep.equal([{ path: '/guides/intro', title: 'Intro', description: null }]);
  });

  it('leaves out downloads, other websites and addresses that climb out of the portal', () => {
    const llmsTxt = [
      '- [SDK](/__downloads/sdk.zip)',
      '- [Status](https://status.example.com)',
      '- [Relative](guides/intro)',
      '- [Climb](/guides/../../secret)',
      '- [Here](/guides/./intro)'
    ].join('\n');

    expect(listedPages(llmsTxt, null)).to.deep.equal([]);
  });
});
