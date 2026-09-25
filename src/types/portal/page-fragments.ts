import { FileName } from '../file/fileName.js';

// Beside the generated directory, not in it: there the collection and the prerender would take each for a page.
export const GENERATED_INCLUDES_DIRECTORY_NAME = 'generated-includes';

export const SDK_DOCS_FOLDER = 'sdk-docs';

/** One Markdown file a generated page includes, with the folder it goes in. */
export interface PageFragment {
  folder: string;
  fileName: FileName;
  contents: string;
}

/** Where a language's SDK docs are written, from the root of the portal project. */
export function sdkDocsPath(language: string): string {
  return [GENERATED_INCLUDES_DIRECTORY_NAME, SDK_DOCS_FOLDER, `${sdkDocsFileName(language)}`].join('/');
}

/** Included rather than held, so MDX compiles them as Markdown, where a `{` or `<` is only text. */
export function pageFragments(sdkDocs: ReadonlyMap<string, string>): PageFragment[] {
  return [...sdkDocs].map(([language, markdown]) => ({
    folder: SDK_DOCS_FOLDER,
    fileName: sdkDocsFileName(language),
    contents: markdownFile(markdown)
  }));
}

function sdkDocsFileName(language: string): FileName {
  return new FileName(`${language}.md`);
}

function markdownFile(text: string): string {
  const trimmed = text.trimEnd();
  return trimmed.length === 0 ? '' : `${trimmed}\n`;
}
