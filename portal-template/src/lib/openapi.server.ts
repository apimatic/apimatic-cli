import { createOpenAPI, type OpenAPIServer } from 'fumadocs-openapi/server';
import { portal } from './portal';

// One server per spec: staticSource() emits pages for every schema its server knows about,
// so sharing a server across baseDirs duplicates pages.
export const servers: Record<string, OpenAPIServer> = Object.fromEntries(
  Object.entries(portal.specs).map(([id, file]) => [id, createOpenAPI({ input: { [id]: file } })]),
);

export const openapi: OpenAPIServer | undefined = Object.values(servers)[0];
