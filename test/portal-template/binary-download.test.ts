import { expect } from 'chai';
import { downloadName, extensionOf, isBinaryBody, mediaTypeOf } from '../../portal-template/src/lib/binary-download';

function headers(disposition?: string): Headers {
  return new Headers(disposition ? { 'Content-Disposition': disposition } : {});
}

describe('mediaTypeOf', () => {
  it('drops the parameters and lowercases the type', () => {
    expect(mediaTypeOf('Application/ZIP; charset=binary')).to.equal('application/zip');
  });

  // Fumadocs reads a response without a Content-Type as text.
  it('treats a missing Content-Type as text', () => {
    expect(mediaTypeOf(null)).to.equal('text/plain');
  });
});

describe('isBinaryBody', () => {
  it('offers a download for a body Fumadocs can only count the bytes of', () => {
    expect(isBinaryBody('application/zip', 10)).to.equal(true);
    expect(isBinaryBody('application/octet-stream', 10)).to.equal(true);
    expect(isBinaryBody('application/pdf', 10)).to.equal(true);
  });

  it('leaves the images and text Fumadocs displays itself', () => {
    for (const type of [
      'image/png',
      'text/plain',
      'text/csv',
      'application/json',
      'application/xml',
      'application/javascript',
      'application/problem+json',
      'application/atom+xml'
    ]) {
      expect(isBinaryBody(type, 10), type).to.equal(false);
    }
  });

  it('offers nothing for an empty body', () => {
    expect(isBinaryBody('application/zip', 0)).to.equal(false);
  });
});

describe('extensionOf', () => {
  it('uses the subtype', () => {
    expect(extensionOf('application/zip')).to.equal('zip');
  });

  it('takes the suffix of a structured subtype', () => {
    expect(extensionOf('application/epub+zip')).to.equal('zip');
  });

  it('drops an `x-` prefix', () => {
    expect(extensionOf('application/x-tar')).to.equal('tar');
  });

  it('falls back to `bin` for a subtype that names no extension', () => {
    expect(extensionOf('application/octet-stream')).to.equal('bin');
    expect(extensionOf('application/vnd.ms-excel')).to.equal('bin');
  });
});

describe('downloadName', () => {
  it('names the file after the type without a Content-Disposition', () => {
    expect(downloadName(headers(), 'application/zip')).to.equal('response.zip');
  });

  it('reads a quoted and an unquoted `filename`', () => {
    expect(downloadName(headers('attachment; filename="build.zip"'), 'application/zip')).to.equal('build.zip');
    expect(downloadName(headers('attachment; filename=build.zip'), 'application/zip')).to.equal('build.zip');
  });

  it('prefers the RFC 5987 `filename*` over plain `filename`', () => {
    const disposition = 'attachment; filename="fallback.zip"; filename*=UTF-8\'\'r%C3%A9sum%C3%A9.zip';
    expect(downloadName(headers(disposition), 'application/zip')).to.equal('résumé.zip');
  });

  it('falls back to `filename` when `filename*` is malformed', () => {
    const disposition = 'attachment; filename="fallback.zip"; filename*=UTF-8\'\'%E0%A4%A.zip';
    expect(downloadName(headers(disposition), 'application/zip')).to.equal('fallback.zip');
  });

  it('keeps only the basename of a path the server sends', () => {
    expect(downloadName(headers('attachment; filename="../../etc/passwd"'), 'application/zip')).to.equal('passwd');
    expect(downloadName(headers('attachment; filename="C:\\Windows\\evil.exe"'), 'application/zip')).to.equal(
      'evil.exe'
    );
  });

  it('falls back when the basename is empty', () => {
    expect(downloadName(headers('attachment; filename="dir/"'), 'application/zip')).to.equal('response.zip');
  });
});
