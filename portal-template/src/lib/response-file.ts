import { parse } from 'content-disposition';
import mime from 'mime';

export function responseFileOf({ body, headers }: { body: ArrayBuffer; headers: Headers }): File | undefined {
  if (body.byteLength === 0) return undefined;
  const type = mediaTypeOf(headers.get('Content-Type'));
  return new File([body], nameSentBy(headers) ?? `response.${extensionOf(type)}`, { type });
}

function mediaTypeOf(contentType: string | null): string {
  return (contentType ?? 'text/plain').split(';')[0].trim().toLowerCase();
}

function nameSentBy(headers: Headers): string | undefined {
  const disposition = headers.get('Content-Disposition');
  return disposition ? withoutFolders(parse(disposition).parameters.filename) : undefined;
}

function withoutFolders(name: string | undefined): string | undefined {
  return name?.split(/[\\/]/).pop() || undefined;
}

function extensionOf(type: string): string {
  return mime.getExtension(type) ?? mime.getExtension(structuredSuffixTypeOf(type)) ?? 'bin';
}

function structuredSuffixTypeOf(type: string): string {
  const plus = type.lastIndexOf('+');
  return plus === -1 ? type : `application/${type.slice(plus + 1)}`;
}
