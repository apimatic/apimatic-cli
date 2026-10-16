import { expect } from 'chai';
import path from 'path';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FilePath } from '../../../src/types/file/filePath';
import { OpenApiDocument } from '../../../src/types/portal/openapi-document';
import { SpecBundle } from '../../../src/types/portal/spec-bundle';

describe('SpecBundle', () => {
  const spec = new DirectoryPath(path.resolve('/project/src/spec'));
  const at = (name: string) => FilePath.resolve(spec, name);
  const parsed = (value: unknown) => OpenApiDocument.parse(JSON.stringify(value))._unsafeUnwrap();

  /** Each file still to read, and the file that names it. */
  const unread = (bundle: SpecBundle) =>
    bundle
      .unread()
      .map(({ file, referencedBy }) => `${file.relativeTo(spec)}, named in ${referencedBy.relativeTo(spec)}`);

  it('lists each file named and not yet read once, with the first file to name it, and ends at a cycle', () => {
    const bundle = new SpecBundle(
      at('api.json'),
      parsed({ Pet: { $ref: './Pet.json' }, Pets: { items: { $ref: './Pet.json#/Pet' } } })
    );
    expect(unread(bundle)).to.deep.equal(['Pet.json, named in api.json']);

    bundle.add(at('Pet.json'), parsed({ owner: { $ref: './Owner.json' }, root: { $ref: './api.json' } }));
    expect(unread(bundle)).to.deep.equal(['Owner.json, named in Pet.json']);

    bundle.add(at('Owner.json'), parsed({ pet: { $ref: './Pet.json' } }));
    expect(unread(bundle)).to.be.empty;
  });

  it('names what a file refers to from its own folder', () => {
    const bundle = new SpecBundle(at('api.json'), parsed({ Pet: { $ref: './schemas/Pet.json' } }));

    bundle.add(at('schemas/Pet.json'), parsed({ owner: { $ref: './Owner.json' } }));

    expect(unread(bundle)).to.deep.equal(['schemas/Owner.json, named in schemas/Pet.json']);
  });

  it('lists the operations of a path item kept in another file after its own', () => {
    const bundle = new SpecBundle(
      at('api.json'),
      parsed({ openapi: '3.0.0', paths: { '/pets': { $ref: './paths.json#/pets' }, '/health': { get: {} } } })
    );

    bundle.add(at('paths.json'), parsed({ pets: { get: {}, post: {} } }));

    expect(bundle.endpoints().map(String)).to.deep.equal(['GET /health', 'GET /pets', 'POST /pets']);
  });

  it('lists once an operation declared both beside the $ref of a path item and in the file it refers to', () => {
    const bundle = new SpecBundle(
      at('api.json'),
      parsed({ openapi: '3.0.0', paths: { '/pets': { $ref: './paths.json#/pets', get: {} } } })
    );

    bundle.add(at('paths.json'), parsed({ pets: { get: {}, post: {} } }));

    expect(bundle.endpoints().map(String)).to.deep.equal(['GET /pets', 'POST /pets']);
  });
});
