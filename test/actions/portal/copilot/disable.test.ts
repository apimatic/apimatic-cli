import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { PortalCopilotDisableAction } from '../../../../src/actions/portal/copilot/disable';
import { ServiceError } from '../../../../src/infrastructure/service-error';
import { CopilotPortalService } from '../../../../src/infrastructure/services/copilot-portal-service';
import { PortalAuthorizationService } from '../../../../src/infrastructure/services/portal-authorization-service';
import { PortalCopilotDisablePrompts } from '../../../../src/prompts/portal/copilot/disable';
import { CommandMetadata } from '../../../../src/types/common/command-metadata';
import { DirectoryPath } from '../../../../src/types/file/directoryPath';
import { ProjectContext } from '../../../../src/types/project-context';
import { withoutCopilotUrl } from '../../../helpers/copilot-url';

const COMMAND_METADATA: CommandMetadata = { commandName: 'portal:copilot:disable', shell: 'test' };
const KEY = `pk_live_${'a'.repeat(32)}`;
const SITE = { name: 'Acme Docs', url: 'https://example.com/docs' };

describe('PortalCopilotDisableAction', () => {
  withoutCopilotUrl();

  let root: string;
  let prompts: sinon.SinonStubbedInstance<PortalCopilotDisablePrompts>;
  let revoke: sinon.SinonStub;

  const configFile = () => path.join(root, 'src', 'apimatic.json');

  const writeConfig = (portal: Record<string, unknown>) => {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify({ portal, languages: { typescript: {} } }, null, 2));
  };

  const savedPortal = () => (JSON.parse(fs.readFileSync(configFile(), 'utf8')) as { portal: unknown }).portal;

  const execute = (authKey: string | null = 'auth-key') =>
    new PortalCopilotDisableAction(new DirectoryPath(root), COMMAND_METADATA, authKey).execute(
      ProjectContext.in(new DirectoryPath(root))
    );

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-disable-'));
    prompts = sinon.stub(PortalCopilotDisablePrompts.prototype);
    prompts.revoke.callsFake((fn) => fn);
    revoke = sinon.stub(CopilotPortalService.prototype, 'revoke').resolves(ok('revoked'));
    writeConfig({ site: SITE, ai: { copilot: { key: KEY, suggestions: ['How?'] } } });
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('revokes the key and removes the chat from the project, dropping an emptied ai block', async () => {
    const result = await execute();

    expect(result.isSuccess()).to.be.true;
    expect(`${revoke.firstCall.args[0]}`).to.equal('https://ask.apimatic.io');
    expect(revoke.firstCall.args.slice(1)).to.deep.equal([KEY, 'test', 'auth-key']);
    expect(savedPortal()).to.deep.equal({ site: SITE });
    expect(prompts.disabled.calledOnceWith('revoked')).to.be.true;
  });

  it('keeps the rest of the ai block', async () => {
    writeConfig({ site: SITE, ai: { pageActions: false, copilot: { key: KEY } } });

    expect((await execute()).isSuccess()).to.be.true;
    expect(savedPortal()).to.deep.equal({ site: SITE, ai: { pageActions: false } });
  });

  it('still removes a key the service no longer knows', async () => {
    revoke.resolves(ok('unknown'));

    expect((await execute()).isSuccess()).to.be.true;
    expect(savedPortal()).to.deep.equal({ site: SITE });
    expect(prompts.disabled.calledOnceWith('unknown')).to.be.true;
  });

  // A lapsed account must still be able to take its key out of use.
  it('does not check the subscription', async () => {
    const authorize = sinon.spy(PortalAuthorizationService.prototype, 'authorizeAskAi');

    expect((await execute()).isSuccess()).to.be.true;
    expect(authorize.called).to.be.false;
  });

  it('keeps the key in the project when it cannot be revoked', async () => {
    const refused = ServiceError.forbidden('This key is not yours.');
    revoke.resolves(err(refused));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.revocationFailed.calledOnceWith(refused)).to.be.true;
    expect(savedPortal()).to.deep.equal({ site: SITE, ai: { copilot: { key: KEY, suggestions: ['How?'] } } });
  });

  it('has nothing to do for a portal without a chat', async () => {
    writeConfig({ site: SITE });

    expect((await execute()).isSuccess()).to.be.true;
    expect(prompts.notEnabled.calledOnce).to.be.true;
    expect(revoke.called).to.be.false;
  });

  it('asks the user to sign in, revoking nothing, when no key is passed or saved', async () => {
    const result = await execute(null);

    expect(result.isFailed()).to.be.true;
    expect(prompts.notLoggedIn.calledOnce).to.be.true;
    expect(revoke.called).to.be.false;
  });
});
