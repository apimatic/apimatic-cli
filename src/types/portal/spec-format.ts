/**
 * Whether a parsed document is one a portal can be built from. `format` names what it is
 * instead when that can be told from the document, and is null when nothing identifies it --
 * a Postman collection, or any other JSON that carries no version key at all.
 */
export type SpecFormat = { supported: true } | { supported: false; format: string | null };

/**
 * The one rule for judging a specification. `portal quickstart` used to carry its own copy,
 * which differed on exactly the case neither reader can name: a document with no version key
 * was accepted by the wizard and skipped by the build, so the project was scaffolded and the
 * preview it launched then refused it for having no specification at all.
 */
export function specFormatOf(document: Record<string, unknown>): SpecFormat {
  const openapi = document.openapi;
  if (typeof openapi === 'string') {
    return openapi.startsWith('3.') ? { supported: true } : { supported: false, format: `OpenAPI ${openapi}` };
  }
  if (document.swagger !== undefined) {
    return { supported: false, format: `Swagger ${versionLabel(document.swagger)}` };
  }
  if (document.asyncapi !== undefined) {
    return { supported: false, format: `AsyncAPI ${versionLabel(document.asyncapi)}` };
  }
  return { supported: false, format: null };
}

// Version keys are strings in well-formed documents; anything else is named rather than
// stringified into `[object Object]`.
function versionLabel(version: unknown): string {
  return typeof version === 'string' || typeof version === 'number' ? `${version}` : '(unknown version)';
}
