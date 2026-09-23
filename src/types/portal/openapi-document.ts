import { parse as parseYaml } from 'yaml';
import { FileName } from '../file/fileName.js';
import { stripByteOrderMark } from '../../utils/string-utils.js';
import { PortalConfig } from './portal-config.js';

/**
 * Whether a parsed document is one a portal can be built from. `format` names what it is
 * instead when that can be told from the document, and is null when nothing identifies it --
 * a Postman collection, or any other JSON that carries no version key at all.
 */
export type SpecFormat = { supported: true } | { supported: false; format: string | null };

const DESCRIPTION_LIMIT = 300;

/** A specification as written to disk, read the one way the wizard and the build agree on. */
export class OpenApiDocument {
  private constructor(private readonly document: Record<string, unknown>) {}

  /**
   * Undefined when neither parser accepts the text. A document that parses to something other
   * than an object is kept, and reports itself as no specification at all.
   */
  public static parse(fileName: FileName, contents: string): OpenApiDocument | undefined {
    try {
      // JSON is valid YAML, but the YAML parser is far slower and specs run to megabytes,
      // so each extension gets the parser built for it.
      const text = stripByteOrderMark(contents);
      const document: unknown = fileName.hasExtension('.json') ? JSON.parse(text) : parseYaml(text);
      return new OpenApiDocument(
        typeof document === 'object' && document !== null && !Array.isArray(document)
          ? (document as Record<string, unknown>)
          : {}
      );
    } catch {
      return undefined;
    }
  }

  public format(): SpecFormat {
    const openapi = this.document.openapi;
    if (typeof openapi === 'string') {
      return openapi.startsWith('3.') ? { supported: true } : { supported: false, format: `OpenAPI ${openapi}` };
    }
    if (this.document.swagger !== undefined) {
      return { supported: false, format: `Swagger ${versionLabel(this.document.swagger)}` };
    }
    if (this.document.asyncapi !== undefined) {
      return { supported: false, format: `AsyncAPI ${versionLabel(this.document.asyncapi)}` };
    }
    return { supported: false, format: null };
  }

  /**
   * A `portal` block to start from, so the wizard has one question fewer to ask. Both fields
   * are written into generated files, so each is collapsed to one line first -- taking only
   * the first line left the description cap unreachable for wrapped prose.
   */
  public suggestedConfig(): PortalConfig {
    const info = this.document.info;
    const fields = typeof info === 'object' && info !== null ? (info as Record<string, unknown>) : {};
    const title = oneLine(fields.title) ?? PortalConfig.placeholder.siteTitle();
    const description = oneLine(fields.description);
    return PortalConfig.create(title, description === null ? null : cap(description, DESCRIPTION_LIMIT));
  }
}

// Version keys are strings in well-formed documents; anything else is named rather than
// stringified into `[object Object]`.
function versionLabel(version: unknown): string {
  return typeof version === 'string' || typeof version === 'number' ? `${version}` : '(unknown version)';
}

function oneLine(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length > 0 ? collapsed : null;
}

// Cuts on a word boundary when one is near enough the limit, so the site description does
// not end mid-word.
function cap(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  const cut = value.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit - 40 ? cut.slice(0, lastSpace) : cut).trimEnd();
}
