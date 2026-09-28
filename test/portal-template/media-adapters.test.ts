import { expect } from 'chai';
import { mediaAdapters } from '../../portal-template/src/lib/media-adapters';

describe('mediaAdapters', () => {
  it('sends text and a file as the reader entered them', () => {
    const photo = new Blob(['png']);

    expect(mediaAdapters['text/plain'].encode({ body: 'hello' })).to.equal('hello');
    expect(mediaAdapters['image/*'].encode({ body: photo })).to.equal(photo);
  });

  it('sends an object the playground built from the schema as JSON', () => {
    expect(mediaAdapters['*/*'].encode({ body: { id: '1' } })).to.equal('{"id":"1"}');
  });

  // Fumadocs lowercases a body's type and drops its parameters before looking up the adapter.
  it('names each type the way Fumadocs looks it up', () => {
    for (const type of Object.keys(mediaAdapters)) {
      expect(type).to.equal(type.toLowerCase().split(';')[0].trim());
    }
  });
});
