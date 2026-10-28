export const SOURCE_DIRECTORY_NAME = 'src';

export const SPEC_DIRECTORY_NAME = 'spec';

/** The extensions of the files in `spec/` read as documents, and the preview reloads on. */
export const SPEC_EXTENSIONS = ['.json', '.yaml', '.yml'];

// The platform also reads other names that start `APIMATIC-META`, a legacy this CLI does not carry.
export const METADATA_FILE_NAME = 'APIMATIC-META.json';

export const CONTENT_DIRECTORY_NAME = 'content';

export const STATIC_DIRECTORY_NAME = 'static';

/** The folders of `src/` the local site build copies to the site's root as they are, so no build upload sends them. */
export const LOCAL_ONLY_DIRECTORY_NAMES = [STATIC_DIRECTORY_NAME] as const;

export const OUTPUT_DIRECTORY_NAMES = {
  sdk: 'sdk',
  portal: 'portal',
  plugin: 'plugin'
} as const;
