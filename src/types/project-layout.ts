/**
 * The names a project is laid out by. The project directory holds the source directory and,
 * beside it, what each command generates unless told otherwise; the source directory holds the
 * inputs. `ProjectContext` and `PortalSourceContext` derive the directories from these, and
 * prompts join them only to show a reader where a directory is.
 */
export const SOURCE_DIRECTORY_NAME = 'src';

export const SPEC_DIRECTORY_NAME = 'spec';

export const CONTENT_DIRECTORY_NAME = 'content';

export const STATIC_DIRECTORY_NAME = 'static';

export const OUTPUT_DIRECTORY_NAMES = {
  sdk: 'sdk',
  portal: 'portal',
  plugin: 'plugin'
} as const;
