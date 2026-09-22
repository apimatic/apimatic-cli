import { expect } from 'chai';
import fs from 'node:fs';
import { MINIMUM_NODE_MAJOR } from '../../src/hooks/node-version';

describe('node version hook', () => {
  it('requires the same major that package.json declares as the engine floor', () => {
    const { engines } = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    const declaredMajor = Number(engines.node.replace(/^\D*/, '').split('.')[0]);

    expect(declaredMajor).to.equal(MINIMUM_NODE_MAJOR);
  });
});
