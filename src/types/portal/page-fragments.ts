import { FileName } from '../file/fileName.js';

export const SDK_DOCS_FOLDER = 'sdk-docs';

/** One Markdown file a generated page includes, with the folder it goes in. */
export interface PageFragment {
  folder: string;
  fileName: FileName;
  contents: string;
}

/**
 * The Markdown the generated pages include rather than hold, so that MDX compiles it as Markdown
 * and a `{` or `<` in it cannot break the build: each language's SDK docs.
 */
export function pageFragments(sdkDocs: ReadonlyMap<string, string>): PageFragment[] {
  return [...sdkDocs].map(([language, markdown]) => ({
    folder: SDK_DOCS_FOLDER,
    fileName: new FileName(`${language}.md`),
    contents: markdownFile(markdown)
  }));
}

function markdownFile(text: string): string {
  const trimmed = text.trimEnd();
  return trimmed.length === 0 ? '' : `${trimmed}\n`;
}
