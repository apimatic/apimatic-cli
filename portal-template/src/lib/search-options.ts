import { parseSearchWith, stringifySearchWith } from '@tanstack/react-router';

/** Query values as text: under a base path the router rewrites the address through these, and JSON loses some. */
export const searchOptions = {
  parseSearch: parseSearchWith((value) => value),
  stringifySearch: stringifySearchWith(JSON.stringify)
};
