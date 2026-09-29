import { expect } from 'chai';
import { metaSchema } from 'fumadocs-core/source/schema';
import { navigationSchema } from '../../portal-template/src/lib/navigation-schema';

/**
 * The schema the `docs` collection validates every `nav.json` against. Fumadocs strips what
 * its own does not name, so the root file's `tabs` reaches the transformer only through this.
 */
describe('navigationSchema', () => {
  it('keeps tabs beside the settings Fumadocs knows', () => {
    const file = { title: 'Overview', tabs: ['tutorials', 'apimatic:api'], pages: ['index', 'guides'] };

    expect(navigationSchema.parse(file)).to.deep.equal(file);
  });

  it('types tabs as pages is typed: an array of strings', () => {
    expect(navigationSchema.safeParse({ tabs: 'tutorials' }).success).to.be.false;
    expect(navigationSchema.safeParse({ tabs: [1] }).success).to.be.false;
    expect(navigationSchema.safeParse({ pages: 'index' }).success).to.be.false;
    expect(navigationSchema.safeParse({}).success).to.be.true;
  });

  // The CLI reports an unknown setting; nothing it lets through may be dropped on the way.
  it('still strips a key neither half knows, so a misspelt tab stays the CLI’s to report', () => {
    expect(navigationSchema.parse({ tab: ['tutorials'], pages: ['index'] })).to.deep.equal({ pages: ['index'] });
  });

  it('adds nothing but tabs to Fumadocs’ own schema', () => {
    expect(Object.keys(navigationSchema.shape).sort()).to.deep.equal([...Object.keys(metaSchema.shape), 'tabs'].sort());
  });
});
