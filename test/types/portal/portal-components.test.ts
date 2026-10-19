import { expect } from 'chai';
import { nearestPortalComponent } from '../../../src/types/portal/portal-components';

describe('nearestPortalComponent', () => {
  for (const [name, meant] of [
    ['Accordian', 'Accordion'],
    ['Stpe', 'Step'],
    ['steps', 'Steps'],
    ['Accordians', 'Accordions'],
    ['Tag', 'Tab']
  ]) {
    it(`takes <${name}> for a typo of <${meant}>`, () => {
      expect(nearestPortalComponent(name)).to.equal(meant);
    });
  }

  // `Tup` and `Bar` are two edits from `Tab`, too many for a three-letter name to be a typo of.
  for (const name of ['Tup', 'Bar', 'Banner']) {
    it(`finds nothing <${name}> is a typo of`, () => {
      expect(nearestPortalComponent(name)).to.be.null;
    });
  }

  for (const [name, counterpart] of [
    ['Note', 'Callout'],
    ['Tip', 'Callout'],
    ['Warning', 'Callout'],
    ['CardGroup', 'Cards'],
    ['AccordionGroup', 'Accordions'],
    ['CodeGroup', 'Tabs'],
    ['TabItem', 'Tab']
  ]) {
    it(`points <${name}>, from another documentation site, to <${counterpart}>`, () => {
      expect(nearestPortalComponent(name)).to.equal(counterpart);
    });
  }
});
