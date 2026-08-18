import * as path from 'path';
import fsExtra from 'fs-extra';
import sinon from 'sinon';
import { expect } from 'chai';
import { err, ok } from 'neverthrow';
import { dir as tmpDir, DirectoryResult } from 'tmp-promise';
import { PluginRecordMetadataAction } from '../../../src/actions/plugin/record-metadata.js';
import { PluginRecordMetadataPrompts } from '../../../src/prompts/plugin/record-metadata.js';
import { ApiService } from '../../../src/infrastructure/services/api-service.js';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { SubscriptionInfo } from '../../../src/types/api/account.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { PluginConfigData } from '../../../src/types/plugin/plugin-config.js';
import { CommandMetadata } from '../../../src/types/common/command-metadata.js';

const COMMAND_METADATA: CommandMetadata = { commandName: 'plugin generate', shell: 'test' };

// Kept deliberately different from SUGGESTED_DEFAULTS: if the two matched, an action that dropped
// the answers and wrote its own suggestions would still satisfy every assertion below.
const ANSWERS = { pluginId: 'bank-of-acme', pluginName: 'Bank of Acme', pluginVersion: '2.1.0' };

const SUGGESTED_DEFAULTS = { pluginId: 'acme-payments', pluginName: 'Acme Payments', pluginVersion: '0.1.0' };

const ACCOUNT = {
  FullName: 'Acme',
  Email: 'developers@acme.com',
  ApiCopilotKeys: ['copilot-key']
} as unknown as SubscriptionInfo;

describe('PluginRecordMetadataAction', () => {
  let tmpDirResult: DirectoryResult;
  let buildDirectory: string;
  let action: PluginRecordMetadataAction;

  const execute = () => action.execute(new DirectoryPath(buildDirectory));

  const writtenConfig = (): PluginConfigData => fsExtra.readJsonSync(path.join(buildDirectory, 'plugin-config.json'));

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    buildDirectory = path.join(tmpDirResult.path, 'some-project-folder', 'src');
    await fsExtra.ensureDir(buildDirectory);

    // The spinner would render to stdout; pass the underlying promise straight through.
    sinon.stub(PluginRecordMetadataPrompts.prototype, 'spinnerAccountInfo').callsFake((fn) => fn);
    sinon.stub(PluginRecordMetadataPrompts.prototype, 'metadataRecorded');
    sinon.stub(ApiService.prototype, 'getAccountInfo').resolves(ok(ACCOUNT));

    action = new PluginRecordMetadataAction(new DirectoryPath(tmpDirResult.path), COMMAND_METADATA, 'auth-key');
  });

  afterEach(async () => {
    sinon.restore();
    await tmpDirResult.cleanup();
  });

  const answers = (overrides: Partial<typeof ANSWERS> = {}) =>
    sinon
      .stub(PluginRecordMetadataPrompts.prototype, 'inputPluginMetadata')
      .resolves({ metadata: { ...ANSWERS, ...overrides } });

  it('writes the metadata and a default licence into the config', async () => {
    answers();

    const result = await execute();

    expect(result.isSuccess()).to.be.true;
    expect(writtenConfig()).to.include({ schemaVersion: 1, ...ANSWERS, license: 'MIT' });
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

  describe('the defaults offered to the prompts', () => {
    it('are the hard-coded examples', async () => {
      const inputPluginMetadata = answers();

      await execute();

      expect(inputPluginMetadata.firstCall.args[0]).to.deep.equal(SUGGESTED_DEFAULTS);
    });

    it('do not follow the project directory name', async () => {
      buildDirectory = path.join(tmpDirResult.path, 'invoicing-api', 'src');
      await fsExtra.ensureDir(buildDirectory);
      const inputPluginMetadata = answers();

      await execute();

      expect(inputPluginMetadata.firstCall.args[0]).to.deep.equal(SUGGESTED_DEFAULTS);
    });

    it('give way to whatever the user answered', async () => {
      answers();

      await execute();

      expect(writtenConfig()).to.include(ANSWERS);
    });
  });

  it('cancels without writing anything when the user escapes the prompts', async () => {
    sinon
      .stub(PluginRecordMetadataPrompts.prototype, 'inputPluginMetadata')
      .resolves({ cancelled: 'A plugin ID is required' });

    const result = await execute();

    expect(result.isCancelled()).to.be.true;
    expect(fsExtra.existsSync(path.join(buildDirectory, 'plugin-config.json'))).to.be.false;
  });

  // The caller prints this to say which answer was missing, so it has to survive on the result.
  it('carries the reason the prompts were abandoned', async () => {
    sinon
      .stub(PluginRecordMetadataPrompts.prototype, 'inputPluginMetadata')
      .resolves({ cancelled: 'A plugin version is required' });

    const result = await execute();

    expect(result.getMessage()).to.equal('A plugin version is required');
  });

  it('still writes the config when the account lookup fails, leaving the author out', async () => {
    answers();
    (ApiService.prototype.getAccountInfo as sinon.SinonStub).resolves(err(ServiceError.ServerError));
    const accountInfoUnavailable = sinon.stub(PluginRecordMetadataPrompts.prototype, 'accountInfoUnavailable');

    const result = await execute();

    expect(result.isSuccess()).to.be.true;
    expect(accountInfoUnavailable.called).to.be.true;
    expect(writtenConfig()).to.not.have.property('author');
    expect(writtenConfig().pluginId).to.equal(ANSWERS.pluginId);
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
    const pluginConfigUnreadable = sinon.stub(PluginRecordMetadataPrompts.prototype, 'pluginConfigUnreadable');

    const result = await execute();

    expect(result.isFailed()).to.be.true;
    expect(pluginConfigUnreadable.called).to.be.true;
    expect(fsExtra.readFileSync(path.join(buildDirectory, 'plugin-config.json'), 'utf-8')).to.equal('{ not json');
  });
});
