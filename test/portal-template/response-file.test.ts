import { expect } from 'chai';
import { responseFileOf } from '../../portal-template/src/lib/response-file';

function fileOf(headers: Record<string, string>, byteLength = 3): File | undefined {
  return responseFileOf({ body: new ArrayBuffer(byteLength), headers: new Headers(headers) });
}

function nameOf(contentType: string, disposition?: string): string | undefined {
  return fileOf({ 'Content-Type': contentType, ...(disposition ? { 'Content-Disposition': disposition } : {}) })?.name;
}

describe('responseFileOf', () => {
  it('offers nothing for an empty body', () => {
    expect(fileOf({ 'Content-Type': 'application/zip' }, 0)).to.equal(undefined);
  });

  it('offers any other body, whatever its type', () => {
    for (const type of ['application/zip', 'application/json', 'text/csv', 'image/png']) {
      expect(fileOf({ 'Content-Type': type }), type).to.not.equal(undefined);
    }
  });

  it('keeps the media type without its parameters', () => {
    expect(fileOf({ 'Content-Type': 'Application/ZIP; charset=binary' })?.type).to.equal('application/zip');
  });

  it('reads a body without a Content-Type as text, as the result panel above it does', () => {
    const file = fileOf({});
    expect(file?.type).to.equal('text/plain');
    expect(file?.name).to.equal('response.txt');
  });

  describe('name', () => {
    it('comes from the type when Content-Disposition is missing or not exposed cross-origin', () => {
      expect(nameOf('application/zip')).to.equal('response.zip');
    });

    it('uses the extension registered for the type', () => {
      expect(nameOf('application/epub+zip')).to.equal('response.epub');
      expect(nameOf('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).to.equal('response.xlsx');
      expect(nameOf('application/gzip')).to.equal('response.gz');
      expect(nameOf('application/json')).to.equal('response.json');
    });

    it('falls back to the structured suffix of an unregistered type', () => {
      expect(nameOf('application/problem+json')).to.equal('response.json');
      expect(nameOf('application/soap+xml')).to.equal('response.xml');
    });

    it('falls back to `bin` for a type with no registered extension', () => {
      expect(nameOf('application/octet-stream')).to.equal('response.bin');
      expect(nameOf('application/x-protobuf')).to.equal('response.bin');
    });

    it('reads a quoted and an unquoted `filename`', () => {
      expect(nameOf('application/zip', 'attachment; filename="build.zip"')).to.equal('build.zip');
      expect(nameOf('application/zip', 'attachment; filename=build.zip')).to.equal('build.zip');
    });

    it('prefers the RFC 5987 `filename*` over plain `filename`, in either order', () => {
      expect(
        nameOf('application/zip', 'attachment; filename="fallback.zip"; filename*=UTF-8\'\'r%C3%A9sum%C3%A9.zip')
      ).to.equal('résumé.zip');
      expect(
        nameOf('application/zip', 'attachment; filename*=UTF-8\'\'r%C3%A9sum%C3%A9.zip; filename="fallback.zip"')
      ).to.equal('résumé.zip');
    });

    it('falls back to `filename` when `filename*` is malformed', () => {
      expect(
        nameOf('application/zip', 'attachment; filename="fallback.zip"; filename*=UTF-8\'\'%E0%A4%A.zip')
      ).to.equal('fallback.zip');
    });

    it('keeps only the basename of a path the server sends', () => {
      expect(nameOf('application/zip', 'attachment; filename="../../etc/passwd"')).to.equal('passwd');
      expect(nameOf('application/zip', 'attachment; filename="C:\\\\Windows\\\\evil.exe"')).to.equal('evil.exe');
      expect(nameOf('application/zip', 'attachment; filename=C:\\Windows\\evil.exe')).to.equal('evil.exe');
    });

    it('falls back to the type when the basename is empty', () => {
      expect(nameOf('application/zip', 'attachment; filename="dir/"')).to.equal('response.zip');
    });
  });
});
