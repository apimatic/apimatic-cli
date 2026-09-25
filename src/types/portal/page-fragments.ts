import { FileName } from '../file/fileName.js';
import { SpecDescription } from './spec-description.js';

export const SDKS_INTRO = new FileName('sdks-intro.md');

export const SDKS_ABOUT = new FileName('sdks-about.md');

export const SDK_DOCS_FOLDER = 'sdk-docs';

// Names no portal, so no edit to the site's name can leave it stale.
const FALLBACK_INTRO =
  'Choose a language to download its SDK, or open its page to see how to install it and get started.';

/** One Markdown file a generated page includes, with the folder it goes in, if any. */
export interface PageFragment {
  folder: string | null;
  fileName: FileName;
  contents: string;
}

/**
 * The Markdown the generated pages include rather than hold, so that MDX compiles it as Markdown
 * and a `{` or `<` in it cannot break the build: the SDKs page's introduction and the rest of the
 * spec's description below its cards, and each language's SDK docs.
 */
export function pageFragments(
  description: SpecDescription | null,
  sdkDocs: ReadonlyMap<string, string>
): PageFragment[] {
  return [
    { folder: null, fileName: SDKS_INTRO, contents: markdownFile(description?.lead() ?? FALLBACK_INTRO) },
    { folder: null, fileName: SDKS_ABOUT, contents: markdownFile(description?.rest() ?? '') },
    ...[...sdkDocs].map(([language, markdown]) => ({
      folder: SDK_DOCS_FOLDER,
      fileName: new FileName(`${language}.md`),
      contents: markdownFile(markdown)
    }))
  ];
}

function markdownFile(text: string): string {
  const trimmed = text.trimEnd();
  return trimmed.length === 0 ? '' : `${trimmed}\n`;
}
