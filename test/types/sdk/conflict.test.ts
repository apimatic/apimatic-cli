import { expect } from 'chai';
import { GENERATED_MARKER, MergedText, YOURS_MARKER } from '../../../src/types/sdk/conflict-markers.js';
import {
  Conflict,
  FileWrite,
  MarkedConflict,
  MergeFiles,
  PlacedConflict,
  Settlement,
  WholeConflict
} from '../../../src/types/sdk/conflict.js';
import { bytes, markedByGit, named, NO_FILES, rel, SIDES, written } from '../../helpers/merge.js';

describe('MarkedConflict', () => {
  const marked = new MarkedConflict(
    rel('a.ts'),
    'bothChanged',
    [],
    MergedText.parse(bytes(`top\n${markedByGit('mine', 'theirs')}`))
  );

  it('lands with the CLI’s labels when resolved by hand', () => {
    expect(marked.leavesMarkers()).to.be.true;
    expect(written(marked.asPlaced())).to.deep.equal([
      ['a.ts', `top\n${YOURS_MARKER}\nmine\n=======\ntheirs\n${GENERATED_MARKER}\n`]
    ]);
  });

  it('settles each block for the side chosen, counted among the merged files', () => {
    expect(written(marked.settledFor('yours').writes())).to.deep.equal([['a.ts', 'top\nmine\n']]);
    expect(written(marked.settledFor('generated').writes())).to.deep.equal([['a.ts', 'top\ntheirs\n']]);
    expect(named(marked.settledFor('generated').countedIn(NO_FILES))).to.deep.equal({
      ...named(NO_FILES),
      merged: ['a.ts']
    });
  });
});

describe('WholeConflict', () => {
  const generated: FileWrite = { path: rel('a.ts'), content: bytes('generated') };

  it('takes the generator’s version for its side where it has one, and keeps yours for your side', () => {
    const binary = new WholeConflict(
      rel('a.ts'),
      'binary',
      [],
      [],
      Settlement.updated(generated),
      Settlement.kept(rel('a.ts'))
    );

    expect(binary.leavesMarkers()).to.be.false;
    expect(binary.settledFor('generated').writes()).to.deep.equal([generated]);
    expect(named(binary.settledFor('generated').countedIn(NO_FILES)).updated).to.deep.equal(['a.ts']);
    expect(binary.settledFor('yours').writes()).to.deep.equal([]);
    expect(named(binary.settledFor('yours').countedIn(NO_FILES)).kept).to.deep.equal(['a.ts']);
  });

  it('keeps an edited file the generator no longer produces, for the generator’s side too', () => {
    const kept = Settlement.kept(rel('a.ts'));
    const dropped = new WholeConflict(rel('a.ts'), 'noLongerGenerated', [], [], kept, kept);

    for (const side of SIDES) {
      expect(dropped.settledFor(side).writes()).to.deep.equal([]);
      expect(named(dropped.settledFor(side).countedIn(NO_FILES)).kept).to.deep.equal(['a.ts']);
    }
  });

  it('lets a deletion of yours stand for your side, saying nothing, and writes the generator’s version for its own', () => {
    const deleted = new WholeConflict(
      rel('a.ts'),
      'deletedByYou',
      [],
      [generated],
      Settlement.updated(generated),
      Settlement.untouched()
    );

    expect(deleted.asPlaced()).to.deep.equal([generated]);
    expect(deleted.settledFor('yours').writes()).to.deep.equal([]);
    expect(deleted.settledFor('yours').countedIn(NO_FILES)).to.deep.equal(NO_FILES);
    expect(deleted.settledFor('generated').writes()).to.deep.equal([generated]);
  });
});

describe('PlacedConflict', () => {
  it('keeps git’s placement for either side, counting nothing', () => {
    const placed: FileWrite = { path: rel('model/custom.ts'), content: bytes('custom') };
    const other: Conflict = new PlacedConflict(rel('model/custom.ts'), [], [placed]);

    expect(other.kind).to.equal('other');
    expect(other.leavesMarkers()).to.be.false;
    expect(other.asPlaced()).to.deep.equal([placed]);
    for (const side of SIDES) {
      expect(other.settledFor(side).writes()).to.deep.equal([placed]);
      expect(other.settledFor(side).countedIn(NO_FILES)).to.deep.equal(NO_FILES);
    }
  });
});

describe('Settlement', () => {
  it('removes its path for a deletion of yours the last run wrote over, counting nothing', () => {
    const removed = Settlement.removed(rel('a.ts'));

    expect(removed.writes()).to.deep.equal([]);
    expect(removed.removes().map(String)).to.deep.equal(['a.ts']);
    expect(removed.countedIn(NO_FILES)).to.deep.equal(NO_FILES);
    expect(Settlement.kept(rel('b.ts')).removes()).to.deep.equal([]);
  });

  it('counts its path into the summary after the paths already there, leaving the summary given as it was', () => {
    const files: MergeFiles = { ...NO_FILES, kept: [rel('mine.ts')] };

    const counted = Settlement.kept(rel('a.ts')).countedIn(files);

    expect(named(counted)).to.deep.equal({ ...named(NO_FILES), kept: ['mine.ts', 'a.ts'] });
    expect(named(files).kept).to.deep.equal(['mine.ts']);
  });
});
