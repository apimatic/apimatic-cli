import { expect } from 'chai';
import { SpecMetadata } from '../../../src/types/portal/spec-metadata';

describe('SpecMetadata', () => {
  const read = (document: unknown): SpecMetadata => {
    const metadata = SpecMetadata.parse(JSON.stringify(document));
    expect(metadata, 'unparsable').to.not.be.undefined;
    return metadata as SpecMetadata;
  };

  describe('parse', () => {
    it('is undefined for text that is not JSON', () => {
      expect(SpecMetadata.parse('{ not json')).to.be.undefined;
    });

    it('reads a file written with a byte-order mark', () => {
      const metadata = SpecMetadata.parse('﻿' + JSON.stringify({ MergeConfiguration: { MergeApis: true } }));

      expect(metadata?.mergesApis()).to.be.true;
    });
  });

  describe('mergesApis', () => {
    it('merges only when the file turns merging on', () => {
      expect(read({ MergeConfiguration: { MergeApis: true } }).mergesApis()).to.be.true;
      expect(read({ MergeConfiguration: { MergeApis: false } }).mergesApis()).to.be.false;
      expect(read({ MergeConfiguration: {} }).mergesApis()).to.be.false;
    });

    // The file carries the SDK's settings too, and most projects have one for those alone.
    it('does not merge for a file with no merge configuration, or one that is not an object', () => {
      expect(read({ CodeGenSettings: { Timeout: 30 } }).mergesApis()).to.be.false;
      expect(read({ MergeConfiguration: 'yes' }).mergesApis()).to.be.false;
      expect(read([1, 2]).mergesApis()).to.be.false;
    });
  });

  describe('mergeOrder', () => {
    it('gives the folders in the order the file lists them', () => {
      const metadata = read({ MergeConfiguration: { MergeApis: true, MergeOrderOfDirectories: ['beta', 'alpha'] } });

      expect(metadata.mergeOrder()).to.deep.equal(['beta', 'alpha']);
    });

    // The platform then merges every folder beside the file, by name.
    it('is null when the file lists no folders', () => {
      const orderOf = (order?: unknown) =>
        read({ MergeConfiguration: { MergeApis: true, MergeOrderOfDirectories: order } }).mergeOrder();

      expect(orderOf()).to.be.null;
      expect(orderOf('alpha')).to.be.null;
      expect(orderOf([])).to.be.null;
      expect(orderOf([7, null])).to.be.null;
    });

    it('leaves out an entry that is not a folder name', () => {
      const metadata = read({ MergeConfiguration: { MergeApis: true, MergeOrderOfDirectories: ['alpha', 7, null] } });

      expect(metadata.mergeOrder()).to.deep.equal(['alpha']);
    });
  });
});
