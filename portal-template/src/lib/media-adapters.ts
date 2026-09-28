import type { MediaAdapter } from 'fumadocs-openapi';

// Fumadocs throws on a request body type it has no adapter for, and matches a wildcard type only as written.
const UNADAPTED_MEDIA_TYPES = [
  '*/*',
  'application/*',
  'application/*+json',
  'text/*',
  'image/*',
  'audio/*',
  'video/*',
  // Fumadocs' own fallback misses "text/plain; charset=utf-8" and quotes the text as JSON.
  'text/plain',
  'text/json',
  'text/html',
  'text/csv',
  'text/xml',
  'application/yaml',
  'application/pdf',
  'application/zip',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/svg+xml'
];

const asEntered: MediaAdapter = {
  // An object the playground built from the schema would otherwise be sent as "[object Object]".
  encode: ({ body }) => (typeof body === 'string' || body instanceof Blob ? body : JSON.stringify(body)),
  // The portal registers no Fumadocs code generator, so nothing asks for a body example.
  generateExample: () => undefined
};

export const mediaAdapters = Object.fromEntries(UNADAPTED_MEDIA_TYPES.map((type) => [type, asEntered]));
