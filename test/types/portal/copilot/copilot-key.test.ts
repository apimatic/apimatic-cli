import { expect } from 'chai';
import { CopilotKey } from '../../../../src/types/portal/copilot/copilot-key';

describe('CopilotKey', () => {
  describe('generate', () => {
    it('makes a key of each kind in the format the Ask AI service accepts', () => {
      for (const kind of ['live', 'dev'] as const) {
        const key = CopilotKey.generate(kind);

        expect(key.toString()).to.match(new RegExp(`^pk_${kind}_[A-Za-z0-9]{32}$`));
        expect(key.kind()).to.equal(kind);
        expect(CopilotKey.parse(key.toString())?.toString()).to.equal(key.toString());
      }
    });

    it('never makes the same key twice', () => {
      const keys = new Set(Array.from({ length: 500 }, () => CopilotKey.generate('live').toString()));

      expect(keys.size).to.equal(500);
    });
  });

  describe('parse', () => {
    it('reads a key the service accepts, and its kind', () => {
      expect(CopilotKey.parse(`pk_live_${'a'.repeat(24)}`)?.kind()).to.equal('live');
      expect(CopilotKey.parse(`pk_dev_${'Z9'.repeat(32)}`)?.kind()).to.equal('dev');
    });

    it('refuses anything else', () => {
      for (const text of [
        'pk_test',
        `pk_prod_${'a'.repeat(32)}`,
        `pk_live_${'a'.repeat(23)}`,
        `pk_live_${'a'.repeat(65)}`,
        `pk_live_${'a'.repeat(31)}-`,
        ` pk_live_${'a'.repeat(32)}`,
        'b7f1d6a0-2a4f-4cf1-9d6e-2b2b6f0e7c11'
      ]) {
        expect(CopilotKey.parse(text), text).to.be.null;
      }
    });
  });

  describe('reusable', () => {
    const live = `pk_live_${'a'.repeat(32)}`;

    it('keeps a key of the kind asked for', () => {
      expect(CopilotKey.reusable(live, 'live')._unsafeUnwrap().toString()).to.equal(live);
    });

    it('says why another key is not one to keep', () => {
      expect(CopilotKey.reusable(live, 'dev')._unsafeUnwrapErr()).to.deep.equal({ kind: 'otherKind', current: 'live' });
      expect(CopilotKey.reusable('pk_test', 'live')._unsafeUnwrapErr()).to.deep.equal({ kind: 'unrecognized' });
    });
  });
});
