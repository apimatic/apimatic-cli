// Fumadocs shows an image response inline and a text one as code; any other body it only counts in bytes.
// These mirror its rules (fumadocs-openapi 11.4.1, `getTextFormat`) so the download is offered for exactly that case.
const TEXT_TYPES = new Set([
  'application/json',
  'application/javascript',
  'application/x-javascript',
  'application/xml'
]);

export function mediaTypeOf(contentType: string | null): string {
  return (contentType ?? 'text/plain').split(';')[0].trim().toLowerCase();
}

export function isBinaryBody(mediaType: string, byteLength: number): boolean {
  if (byteLength === 0 || mediaType.startsWith('image/') || mediaType.startsWith('text/')) return false;
  return !TEXT_TYPES.has(mediaType) && !mediaType.endsWith('+json') && !mediaType.endsWith('+xml');
}

// RFC 6266: the RFC 5987 `filename*` (charset''percent-encoded) wins over a plain `filename` sent with it.
export function parseContentDisposition(header: string | null): string | undefined {
  if (!header) return undefined;

  const extended = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      // Malformed percent-encoding: fall back to `filename`.
    }
  }

  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header);
  return plain ? (plain[1] ?? plain[2]).trim() : undefined;
}

// `application/epub+zip` -> `zip`, `application/x-tar` -> `tar`; `octet-stream` or `vnd.*` names no extension.
export function extensionOf(mediaType: string): string {
  let subtype = mediaType.slice(mediaType.indexOf('/') + 1);
  if (subtype.includes('+')) subtype = subtype.slice(subtype.lastIndexOf('+') + 1);
  if (subtype.startsWith('x-')) subtype = subtype.slice(2);
  return /^[a-z0-9]+$/i.test(subtype) ? subtype : 'bin';
}

export function downloadName(headers: Headers, mediaType: string): string {
  // The name comes from the server, so only its basename is kept: it cannot point outside the downloads folder.
  // A cross-origin API that does not expose Content-Disposition reads as no header at all.
  const name = parseContentDisposition(headers.get('Content-Disposition'))?.split(/[\\/]/).pop();
  return name || `response.${extensionOf(mediaType)}`;
}
