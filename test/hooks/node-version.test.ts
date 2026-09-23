import { expect } from 'chai';
import sinon from 'sinon';
import hook from '../../src/hooks/node-version';

describe('node version hook', () => {
  const running = Object.getOwnPropertyDescriptor(process.versions, 'node')!;
  let error: sinon.SinonStub;

  const runOn = async (version: string, engines: { node?: string } = { node: '>=24.5.0' }) => {
    Object.defineProperty(process.versions, 'node', { ...running, value: version });
    error = sinon.stub();
    await hook.call({ config: { pjson: { engines } }, error } as any, {} as any);
  };

  afterEach(() => {
    Object.defineProperty(process.versions, 'node', running);
  });

  it('exits with an error on a Node outside the declared engine range', async () => {
    await runOn('24.4.1');

    expect(error.calledOnce).to.be.true;
    expect(error.firstCall.args[0]).to.contain('>=24.5.0').and.contain('24.4.1');
    expect(error.firstCall.args[1]).to.deep.equal({ exit: 1 });
  });

  it('lets a Node inside the declared engine range through', async () => {
    await runOn('24.5.0');

    expect(error.called).to.be.false;
  });

  it('lets any Node through when the manifest declares no engine range', async () => {
    await runOn('18.0.0', {});

    expect(error.called).to.be.false;
  });
});
