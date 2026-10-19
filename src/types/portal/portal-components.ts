import levenshtein from 'fast-levenshtein';

/** Fumadocs' components that `portal-template/src/components/mdx.tsx` registers, so a page uses them without importing them. */
export const FUMADOCS_COMPONENTS: readonly string[] = [
  'Accordion',
  'Accordions',
  'Callout',
  'CalloutContainer',
  'CalloutDescription',
  'CalloutTitle',
  'Card',
  'Cards',
  'CodeBlockTab',
  'CodeBlockTabs',
  'CodeBlockTabsList',
  'CodeBlockTabsTrigger',
  'File',
  'Files',
  'Folder',
  'InlineTOC',
  'Step',
  'Steps',
  'Tab',
  'Tabs',
  'TypeTable'
];

/** The template's own components, which the generated pages are made of and which an author's page can use too. */
export const GENERATED_PAGE_COMPONENTS: readonly string[] = [
  'PluginInstall',
  'PluginLanguage',
  'PluginLanguages',
  'PluginPlatforms',
  'SdkActions',
  'SdkCard',
  'SdkCards'
];

const PORTAL_COMPONENTS: ReadonlySet<string> = new Set([...FUMADOCS_COMPONENTS, ...GENERATED_PAGE_COMPONENTS]);

/** Components of the documentation sites pages are moved from (Mintlify, Docusaurus), by the portal's own that does their job. */
const COUNTERPARTS: ReadonlyMap<string, string> = new Map([
  ['AccordionGroup', 'Accordions'],
  ['Admonition', 'Callout'],
  ['CardGroup', 'Cards'],
  ['Caution', 'Callout'],
  ['Check', 'Callout'],
  ['CodeGroup', 'Tabs'],
  ['Danger', 'Callout'],
  ['Info', 'Callout'],
  ['Note', 'Callout'],
  ['TabItem', 'Tab'],
  ['Tip', 'Callout'],
  ['Warning', 'Callout']
]);

// Two edits turn a short name into another word altogether: `Tip` is two from `Step`.
const mostEditsForATypo = (name: string): number => (name.length <= 3 ? 1 : 2);

export function isPortalComponent(name: string): boolean {
  return PORTAL_COMPONENTS.has(name);
}

/** The component a misspelt or borrowed name most likely meant, or null when none is close. */
export function nearestPortalComponent(name: string): string | null {
  const counterpart = COUNTERPARTS.get(name);
  if (counterpart !== undefined) {
    return counterpart;
  }
  let nearest: string | null = null;
  let fewestEdits = mostEditsForATypo(name) + 1;
  for (const component of PORTAL_COMPONENTS) {
    const edits = levenshtein.get(name.toLowerCase(), component.toLowerCase());
    if (edits < fewestEdits) {
      nearest = component;
      fewestEdits = edits;
    }
  }
  return nearest;
}
