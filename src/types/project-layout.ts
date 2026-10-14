export const SOURCE_DIRECTORY_NAME = 'src';

export const SPEC_DIRECTORY_NAME = 'spec';

// The platform also reads other names that start `APIMATIC-META`, a legacy this CLI does not carry.
export const METADATA_FILE_NAME = 'APIMATIC-META.json';

export const CONTENT_DIRECTORY_NAME = 'content';

export const STATIC_DIRECTORY_NAME = 'static';

export const OUTPUT_DIRECTORY_NAMES = {
  sdk: 'sdk',
  portal: 'portal',
  plugin: 'plugin'
} as const;
