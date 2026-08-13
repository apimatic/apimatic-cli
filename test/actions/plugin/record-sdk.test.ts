import * as path from 'path';
import fsExtra from 'fs-extra';
import sinon from 'sinon';
import { expect } from 'chai';
import { dir as tmpDir, DirectoryResult } from 'tmp-promise';
import { PluginRecordSdkAction } from '../../../src/actions/plugin/record-sdk.js';
import { PluginRecordSdkPrompts } from '../../../src/prompts/plugin/record-sdk.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { PluginConfigData } from '../../../src/types/plugin/plugin-config.js';
import { PublishingProfile } from '../../../src/types/publish/publishing-profile.js';
import { CodeGenerationVersion, Language } from '../../../src/types/sdk/generate.js';

const profileWith = (gitConfiguration: object | undefined, packageConfiguration: object | undefined = undefined) =>
  ({
    getGitConfigurationForLanguage: () => gitConfiguration,
    getPackageConfigurationDataForLanguage: () => packageConfiguration
  } as unknown as PublishingProfile);

const GIT_CONFIG = {
  isEnabled: true,
  credentialsId: 'creds',
  repositoryName: 'acme/acme-payments-csharp',
  branch: 'main'
};

describe('PluginRecordSdkAction', () => {
  let tmpDirResult: DirectoryResult;
  let buildDirectory: string;
  let action: PluginRecordSdkAction;

  const configPath = () => path.join(buildDirectory, 'plugin-config.json');
  const writtenConfig = (): PluginConfigData => fsExtra.readJsonSync(configPath());

  const execute = (profile: PublishingProfile) =>
    action.execute(new DirectoryPath(buildDirectory), Language.CSHARP, profile, CodeGenerationVersion.V3);

  // What `sdk publish --update-plugin-config` does: the flag already answered the question.
  const executeWithoutAsking = (profile: PublishingProfile) =>
    action.execute(new DirectoryPath(buildDirectory), Language.CSHARP, profile, CodeGenerationVersion.V3, false);

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    buildDirectory = path.join(tmpDirResult.path, 'acme-payments', 'src');
    await fsExtra.ensureDir(buildDirectory);
    sinon.stub(PluginRecordSdkPrompts.prototype, 'sdkRecorded');
    action = new PluginRecordSdkAction();
  });

  afterEach(async () => {
    sinon.restore();
    await tmpDirResult.cleanup();
  });

  const accepts = () => sinon.stub(PluginRecordSdkPrompts.prototype, 'confirmRecordSdk').resolves(true);
  const declines = () => sinon.stub(PluginRecordSdkPrompts.prototype, 'confirmRecordSdk').resolves(false);

  it('creates a config carrying the language and no metadata at all', async () => {
    accepts();

    await execute(profileWith(GIT_CONFIG, { packageId: 'Acme.Payments.Sdk' }));

    expect(writtenConfig()).to.deep.equal({
      schemaVersion: 1,
      languages: {
        csharp: {
          source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' },
          package: { packageId: 'Acme.Payments.Sdk' },
          version: 'v3'
        }
      }
    });
  });

  it('adds the language to a config that already has metadata, leaving it alone', async () => {
    await fsExtra.writeJson(configPath(), {
      schemaVersion: 1,
      pluginId: 'acme-payments',
      pluginName: 'Acme Payments',
      license: 'MIT',
      languages: {}
    });
    accepts();

    await execute(profileWith(GIT_CONFIG));

    const config = writtenConfig();
    expect(config).to.include({ pluginId: 'acme-payments', pluginName: 'Acme Payments', license: 'MIT' });
    expect(Object.keys(config.languages)).to.deep.equal(['csharp']);
  });

  it('asks to create the file when there is none', async () => {
    const confirmRecordSdk = accepts();

    await execute(profileWith(GIT_CONFIG));

    expect(confirmRecordSdk.firstCall.args).to.deep.equal([Language.CSHARP, false]);
  });

  it('asks to add to the file when one already exists', async () => {
    await fsExtra.writeJson(configPath(), { schemaVersion: 1, languages: {} });
    const confirmRecordSdk = accepts();

    await execute(profileWith(GIT_CONFIG));

    expect(confirmRecordSdk.firstCall.args).to.deep.equal([Language.CSHARP, true]);
  });

  it('writes nothing when the user declines', async () => {
    declines();

    await execute(profileWith(GIT_CONFIG));

    expect(fsExtra.existsSync(configPath())).to.be.false;
  });

  it('stays silent when the profile names no source repository', async () => {
    const confirmRecordSdk = accepts();

    await execute(profileWith(undefined));

    expect(confirmRecordSdk.called).to.be.false;
    expect(fsExtra.existsSync(configPath())).to.be.false;
  });

  describe('without confirmation (the --update-plugin-config path)', () => {
    it('records without ever prompting', async () => {
      const confirmRecordSdk = sinon.stub(PluginRecordSdkPrompts.prototype, 'confirmRecordSdk');

      await executeWithoutAsking(profileWith(GIT_CONFIG, { packageId: 'Acme.Payments.Sdk' }));

      expect(confirmRecordSdk.called).to.be.false;
      expect(Object.keys(writtenConfig().languages)).to.deep.equal(['csharp']);
    });

    it('still creates the file with no metadata', async () => {
      sinon.stub(PluginRecordSdkPrompts.prototype, 'confirmRecordSdk');

      await executeWithoutAsking(profileWith(GIT_CONFIG));

      const config = writtenConfig();
      expect(config.schemaVersion).to.equal(1);
      expect(config).to.not.have.property('pluginId');
    });

    it('still skips a profile that names no source repository', async () => {
      await executeWithoutAsking(profileWith(undefined));

      expect(fsExtra.existsSync(configPath())).to.be.false;
    });

    it('still refuses to touch a config it cannot read', async () => {
      await fsExtra.writeFile(configPath(), '{ not json');
      const pluginConfigUnreadable = sinon.stub(PluginRecordSdkPrompts.prototype, 'pluginConfigUnreadable');

      await executeWithoutAsking(profileWith(GIT_CONFIG));

      expect(pluginConfigUnreadable.called).to.be.true;
      expect(fsExtra.readFileSync(configPath(), 'utf-8')).to.equal('{ not json');
    });
  });

  it('warns without asking when the config cannot be read', async () => {
    await fsExtra.writeFile(configPath(), '{ not json');
    const confirmRecordSdk = accepts();
    const pluginConfigUnreadable = sinon.stub(PluginRecordSdkPrompts.prototype, 'pluginConfigUnreadable');

    await execute(profileWith(GIT_CONFIG));

    expect(pluginConfigUnreadable.called).to.be.true;
    expect(confirmRecordSdk.called).to.be.false;
    expect(fsExtra.readFileSync(configPath(), 'utf-8')).to.equal('{ not json');
  });
});
