import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { PortalSpec } from '../../../src/types/portal/portal-source';
import { PreviewSpecs } from '../../../src/types/portal/preview-specs';

describe('PreviewSpecs', () => {
  const spec = new DirectoryPath('src', 'spec');
  const document = (name: string): PortalSpec => ({
    slug: name,
    file: new FilePath(spec, new FileName(name)),
    endpoints: []
  });
  const named = (files: FilePath[]) => files.map((file) => file.name().toString());

  /** The change each save warns of, by the names added and removed, for a preview started with `startup`. */
  const warnings = (startup: string[], saves: string[][]) => {
    const preview = new PreviewSpecs(startup.map(document));
    return saves.map((names) => {
      const { change } = preview.show(names.map(document));
      return change === null ? null : { added: named(change.added), removed: named(change.removed) };
    });
  };

  it('warns of nothing while the documents are the ones it started with', () => {
    expect(warnings(['pets.json'], [['pets.json'], ['pets.json']])).to.deep.equal([null, null]);
  });

  it('warns of a document added or removed since it started, on the save that does it and not after', () => {
    expect(
      warnings(['pets.json'], [['orders.json', 'pets.json'], ['orders.json', 'pets.json'], ['orders.json']])
    ).to.deep.equal([
      { added: ['orders.json'], removed: [] },
      null,
      { added: ['orders.json'], removed: ['pets.json'] }
    ]);
  });

  it('says nothing on a return to the documents it started with, and warns again of the change made anew', () => {
    expect(
      warnings(['pets.json'], [['orders.json', 'pets.json'], ['pets.json'], ['orders.json', 'pets.json']])
    ).to.deep.equal([{ added: ['orders.json'], removed: [] }, null, { added: ['orders.json'], removed: [] }]);
  });

  it('says the specifications are fixed once, on the first save it accepts after refusing one', () => {
    const preview = new PreviewSpecs([document('pets.json')]);
    preview.refuse();

    expect(preview.show([document('pets.json')]).fixed).to.be.true;
    expect(preview.show([document('pets.json')]).fixed).to.be.false;
  });
});
