import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { CopilotEnableOptions, PortalCopilotEnableAction } from '../../../../src/actions/portal/copilot/enable';
import { ServiceError } from '../../../../src/infrastructure/service-error';
import { CopilotPortalService } from '../../../../src/infrastructure/services/copilot-portal-service';
import { PortalAuthorizationService } from '../../../../src/infrastructure/services/portal-authorization-service';
import { PortalCopilotEnablePrompts } from '../../../../src/prompts/portal/copilot/enable';
import { CommandMetadata } from '../../../../src/types/common/command-metadata';
import { DirectoryPath } from '../../../../src/types/file/directoryPath';
import { CopilotKey } from '../../../../src/types/portal/copilot/copilot-key';
import { CopilotRegistration } from '../../../../src/types/portal/copilot/copilot-registration';
import { ProjectContext } from '../../../../src/types/project-context';
import { entitlementsWith } from '../../../helpers/account';

const COMMAND_METADATA: CommandMetadata = { commandName: 'portal:copilot:enable', shell: 'test' };
const LIVE_KEY = `pk_live_${'a'.repeat(32)}`;
const DEV_KEY = `pk_dev_${'b'.repeat(32)}`;

describe('PortalCopilotEnableAction', () => {
  let root: string;
  let prompts: sinon.SinonStubbedInstance<PortalCopilotEnablePrompts>;
  let authorizeAskAi: sinon.SinonStub;
  let register: sinon.SinonStub;
  let revoke: sinon.SinonStub;

  const configFile = () => path.join(root, 'src', 'apimatic.json');

  const writeConfig = (portal: Record<string, unknown>) => {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify({ portal, languages: { typescript: {} } }, null, 2));
  };

  const savedConfig = () =>
    JSON.parse(fs.readFileSync(configFile(), 'utf8')) as { portal: Record<string, unknown> & { ai?: unknown } };

  const writeSavedLogin = (authKey: string) =>
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ email: 'a@b.c', authKey }));

  const execute = (options: Partial<CopilotEnableOptions> = {}, authKey: string | null = 'auth-key') =>
    new PortalCopilotEnableAction(new DirectoryPath(root), COMMAND_METADATA, authKey).execute(
      ProjectContext.in(new DirectoryPath(root)),
      { kind: 'live', rotate: false, origins: [], ...options }
    );

  const registeredKey = () => (register.firstCall.args[1] as CopilotKey).toString();
  const registered = () => (register.firstCall.args[2] as CopilotRegistration).toJSON();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-enable-'));
    prompts = sinon.stub(PortalCopilotEnablePrompts.prototype);
    // The spinners would render to stdout; pass the underlying promise straight through.
    prompts.checkSubscription.callsFake((fn) => fn);
    prompts.register.callsFake((fn) => fn);
    prompts.revokePrevious.callsFake((fn) => fn);
    authorizeAskAi = sinon
      .stub(PortalAuthorizationService.prototype, 'authorizeAskAi')
      .resolves(ok(entitlementsWith('askAi')));
    register = sinon.stub(CopilotPortalService.prototype, 'register').resolves(ok('created'));
    revoke = sinon.stub(CopilotPortalService.prototype, 'revoke').resolves(ok('revoked'));
    writeConfig({ site: { name: 'Acme Docs', url: 'https://example.com/docs' } });
  });

  afterEach(() => {
    delete process.env.APIMATIC_COPILOT_URL;
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("registers a new live key for the portal's site and saves it, keeping the rest of the block", async () => {
    writeConfig({ site: { name: 'Acme Docs', url: 'https://example.com/docs' }, ai: { pageActions: false } });

    const result = await execute();

    expect(result.isSuccess()).to.be.true;
    expect(registeredKey()).to.match(/^pk_live_[A-Za-z0-9]{32}$/);
    expect(`${register.firstCall.args[0]}`).to.equal('https://ask.apimatic.io');
    expect(registered()).to.deep.equal({
      name: 'Acme Docs',
      siteUrl: 'https://example.com/docs',
      allowedOrigins: ['https://example.com']
    });
    expect(register.firstCall.args[4]).to.equal('auth-key');
    expect(savedConfig().portal).to.deep.equal({
      site: { name: 'Acme Docs', url: 'https://example.com/docs' },
      ai: { pageActions: false, copilot: { key: registeredKey() } }
    });
    expect(revoke.called).to.be.false;
    expect(prompts.enabled.calledOnceWith('created', sinon.match.any, ['https://example.com'], false)).to.be.true;
    expect(prompts.nextSteps.calledOnceWith('live')).to.be.true;
  });

  it('registers a development key, which needs no site, with the service APIMATIC_COPILOT_URL names', async () => {
    process.env.APIMATIC_COPILOT_URL = 'http://localhost:8787';
    writeConfig({ site: { name: 'Acme Docs' } });

    const result = await execute({ kind: 'dev' });

    expect(result.isSuccess()).to.be.true;
    expect(registeredKey()).to.match(/^pk_dev_/);
    expect(`${register.firstCall.args[0]}`).to.equal('http://localhost:8787');
    expect(registered().allowedOrigins).to.deep.equal([]);
    expect(prompts.nextSteps.calledOnceWith('dev')).to.be.true;
  });

  it('registers the key the portal already has again, so changed sites reach the service', async () => {
    writeConfig({
      site: { name: 'Acme Docs', url: 'https://example.com/docs' },
      ai: { copilot: { key: LIVE_KEY, suggestions: ['How do I start?'] } }
    });
    register.resolves(ok('updated'));
    const before = fs.readFileSync(configFile(), 'utf8');

    const result = await execute({ origins: ['https://staging.example.com'] });

    expect(result.isSuccess()).to.be.true;
    expect(registeredKey()).to.equal(LIVE_KEY);
    expect(registered().allowedOrigins).to.deep.equal(['https://example.com', 'https://staging.example.com']);
    expect(fs.readFileSync(configFile(), 'utf8'), 'nothing to write').to.equal(before);
    expect(revoke.called).to.be.false;
    expect(prompts.enabled.calledOnceWith('updated')).to.be.true;
  });

  it('replaces the key with --rotate, saving the new one before revoking the old', async () => {
    writeConfig({ site: { name: 'Acme Docs', url: 'https://example.com/docs' }, ai: { copilot: { key: LIVE_KEY } } });
    let savedWhenRevoked: unknown;
    revoke.callsFake(async () => {
      savedWhenRevoked = (savedConfig().portal.ai as { copilot: { key: string } }).copilot.key;
      return ok('revoked');
    });

    const result = await execute({ rotate: true });

    expect(result.isSuccess()).to.be.true;
    expect(registeredKey()).to.not.equal(LIVE_KEY);
    expect(savedWhenRevoked).to.equal(registeredKey());
    expect(revoke.firstCall.args[1]).to.equal(LIVE_KEY);
    expect(savedConfig().portal.ai).to.deep.equal({ copilot: { key: registeredKey() } });
    expect(prompts.enabled.calledOnceWith('created', sinon.match.any, sinon.match.any, true)).to.be.true;
  });

  it('still succeeds, warning, when the old key cannot be revoked', async () => {
    writeConfig({ site: { name: 'Acme Docs', url: 'https://example.com/docs' }, ai: { copilot: { key: LIVE_KEY } } });
    revoke.resolves(err(ServiceError.ServerError));

    const result = await execute({ rotate: true });

    expect(result.isSuccess()).to.be.true;
    expect(prompts.previousKeyNotRevoked.calledOnce).to.be.true;
  });

  it('refuses to switch between a development and a live key without --rotate', async () => {
    writeConfig({ site: { name: 'Acme Docs', url: 'https://example.com/docs' }, ai: { copilot: { key: DEV_KEY } } });

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.keyNotReusable.calledOnceWith({ kind: 'otherKind', current: 'dev' }, 'live')).to.be.true;
    expect(register.called).to.be.false;
  });

  it('refuses to register a key the service would not accept, pointing to --rotate', async () => {
    writeConfig({ site: { name: 'Acme Docs', url: 'https://example.com/docs' }, ai: { copilot: { key: 'pk_test' } } });

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.keyNotReusable.calledOnceWith({ kind: 'unrecognized' }, 'live')).to.be.true;
    expect(register.called).to.be.false;
  });

  it('fails without calling the service when a live key would have no site to work on', async () => {
    writeConfig({ site: { name: 'Acme Docs' } });

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.registrationInvalid.calledOnceWith([{ kind: 'noOrigins' }])).to.be.true;
    expect(authorizeAskAi.called).to.be.false;
    expect(register.called).to.be.false;
  });

  it('fails without calling the service when a site passed is not an origin', async () => {
    const result = await execute({ origins: ['https://staging.example.com/docs'] });

    expect(result.isFailed()).to.be.true;
    expect(prompts.registrationInvalid.calledOnce).to.be.true;
    expect(register.called).to.be.false;
  });

  it('fails without calling the service when the subscription does not include Ask AI', async () => {
    const refused = { kind: 'notEntitled' as const, feature: 'askAi' as const };
    authorizeAskAi.resolves(err(refused));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.authorizationFailed.calledOnceWith(refused)).to.be.true;
    expect(register.called).to.be.false;
    expect(savedConfig().portal).to.not.have.property('ai');
  });

  it('uses the passed key, else the saved login, and asks to sign in with neither', async () => {
    writeSavedLogin('saved-key');
    expect((await execute({}, null)).isSuccess()).to.be.true;
    expect(authorizeAskAi.firstCall.args[2]).to.equal('saved-key');
    expect(register.firstCall.args[4]).to.equal('saved-key');

    writeSavedLogin('');
    expect((await execute({}, '  ')).isFailed()).to.be.true;
    expect(prompts.notLoggedIn.calledOnce).to.be.true;
  });

  it('fails, saving nothing, when the service refuses the registration', async () => {
    const refused = ServiceError.badRequest('This account has reached its limit of portals.', {});
    register.resolves(err(refused));

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.registrationFailed.calledOnceWith(refused)).to.be.true;
    expect(savedConfig().portal).to.not.have.property('ai');
  });

  it('fails when APIMATIC_COPILOT_URL is not an address it can use', async () => {
    process.env.APIMATIC_COPILOT_URL = 'http://ask.example.com';

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.invalidServiceAddress.calledOnce).to.be.true;
    expect(register.called).to.be.false;
  });

  it('fails without calling the service when the project has no portal settings', async () => {
    fs.rmSync(configFile());

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(prompts.sourceProblem.firstCall.args[0]).to.deep.equal({ kind: 'missingConfig' });
    expect(register.called).to.be.false;
  });
});
