import * as path from 'path';
import fsExtra from 'fs-extra';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { dir as tmpDir, DirectoryResult } from 'tmp-promise';
import { PluginCreateConfigAction } from '../../../src/actions/plugin/create-config.js';
import { PluginCreateConfigPrompts } from '../../../src/prompts/plugin/create-config.js';
import { ApiService } from '../../../src/infrastructure/services/api-service.js';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { SubscriptionInfo } from '../../../src/types/api/account.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { PluginConfigData } from '../../../src/types/plugin/plugin-config.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'plugin generate', shell: 'test' };

const ACCOUNT = {
  FullName: 'Acme',
  Email: 'developers@acme.com',
  ApiCopilotKeys: ['copilot-key']
} as unknown as SubscriptionInfo;

describe('PluginCreateConfigAction', () => {
  let tmpDirResult: DirectoryResult;
  let buildDirectory: string;
  let action: PluginCreateConfigAction;

  const execute = () => action.execute(new DirectoryPath(buildDirectory));

  const writtenConfig = (): PluginConfigData => fsExtra.readJsonSync(path.join(buildDirectory, 'plugin-config.json'));

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    buildDirectory = path.join(tmpDirResult.path, 'acme-payments', 'src');
    await fsExtra.ensureDir(buildDirectory);

    // The spinner would render to stdout; pass the underlying promise straight through.
    sinon.stub(PluginCreateConfigPrompts.prototype, 'spinnerAccountInfo').callsFake((fn) => fn);
    sinon.stub(PluginCreateConfigPrompts.prototype, 'pluginConfigCreated');
    sinon.stub(ApiService.prototype, 'getAccountInfo').resolves(ok(ACCOUNT));

    action = new PluginCreateConfigAction(new DirectoryPath(tmpDirResult.path), COMMAND_METADATA, 'auth-key');
  });

  afterEach(async () => {
    sinon.restore();
    await tmpDirResult.cleanup();
  });

  const answers = (overrides: Partial<{ pluginId: string; pluginName: string; pluginVersion: string }> = {}) =>
    sinon.stub(PluginCreateConfigPrompts.prototype, 'inputPluginMetadata').resolves({
      pluginId: 'acme-payments',
      pluginName: 'Acme Payments',
      pluginVersion: '0.1.0',
      ...overrides
    });

  it('writes the metadata and a default licence into the config', async () => {
    answers();

    const result = await execute();

    expect(result.isSuccess()).to.be.true;
    expect(writtenConfig()).to.include({
      schemaVersion: 1,
      pluginId: 'acme-payments',
      pluginName: 'Acme Payments',
      pluginVersion: '0.1.0',
      license: 'MIT'
    });
  });

  it('records the author from the account', async () => {
    answers();

    await execute();

    expect(writtenConfig().author).to.deep.equal({ name: 'Acme', email: 'developers@acme.com' });
  });

  it('never writes a plugin key', async () => {
    answers();

    await execute();

    expect(writtenConfig()).to.not.have.property('pluginKey');
  });

  it('seeds the prompt defaults from the project directory name', async () => {
    const inputPluginMetadata = answers();

    await execute();

    expect(inputPluginMetadata.firstCall.args[0]).to.deep.equal({
      pluginId: 'acme-payments',
      pluginName: 'Acme Payments',
      pluginVersion: '0.1.0'
    });
  });

  it('cancels without writing anything when the user escapes the prompts', async () => {
    sinon.stub(PluginCreateConfigPrompts.prototype, 'inputPluginMetadata').resolves(undefined);

    const result = await execute();

    expect(result.isCancelled()).to.be.true;
    expect(fsExtra.existsSync(path.join(buildDirectory, 'plugin-config.json'))).to.be.false;
  });

  it('still writes the config when the account lookup fails, leaving the author out', async () => {
    answers();
    (ApiService.prototype.getAccountInfo as sinon.SinonStub).resolves(err(ServiceError.ServerError));
    const accountInfoUnavailable = sinon.stub(PluginCreateConfigPrompts.prototype, 'accountInfoUnavailable');

    const result = await execute();

    expect(result.isSuccess()).to.be.true;
    expect(accountInfoUnavailable.called).to.be.true;
    expect(writtenConfig()).to.not.have.property('author');
    expect(writtenConfig().pluginId).to.equal('acme-payments');
  });

  it('keeps the languages a previous sdk publish recorded', async () => {
    const entry = { source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp' } };
    await fsExtra.writeJson(path.join(buildDirectory, 'plugin-config.json'), {
      schemaVersion: 1,
      languages: { csharp: entry }
    });
    answers();

    await execute();

    expect(writtenConfig().languages).to.deep.equal({ csharp: entry });
  });

  it('fails rather than overwriting a config it could not read', async () => {
    await fsExtra.writeFile(path.join(buildDirectory, 'plugin-config.json'), '{ not json');
    answers();
    const pluginConfigUnreadable = sinon.stub(PluginCreateConfigPrompts.prototype, 'pluginConfigUnreadable');

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(pluginConfigUnreadable.called).to.be.true;
    expect(fsExtra.readFileSync(path.join(buildDirectory, 'plugin-config.json'), 'utf-8')).to.equal('{ not json');
  });
});
