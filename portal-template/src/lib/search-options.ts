import { parseSearchWith, stringifySearchWith } from '@tanstack/react-router';

/** Query values kept as text: under a base path the router rewrites the address through these on load. */
export const searchOptions = {
  parseSearch: parseSearchWith((value) => value),
  stringifySearch: stringifySearchWith(JSON.stringify)
};
