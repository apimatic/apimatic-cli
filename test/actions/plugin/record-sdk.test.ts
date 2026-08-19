import * as path from 'path';
import fsExtra from 'fs-extra';
import sinon from 'sinon';
import { expect } from 'chai';
import { dir as tmpDir, DirectoryResult } from 'tmp-promise';
import { PluginRecordSdkAction } from '../../../src/actions/plugin/record-sdk.js';
import { PluginRecordSdkPrompts } from '../../../src/prompts/plugin/record-sdk.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { PluginConfigContext } from '../../../src/types/plugin-config-context.js';
import { PluginConfigData } from '../../../src/types/plugin/plugin-config.js';
import { PublishType } from '../../../src/types/publish-api/publishing-profile-item.js';
import { PublishingProfile } from '../../../src/types/publish/publishing-profile.js';
import { SemVersion } from '../../../src/types/publish/version.js';
import { CodeGenerationVersion, Language } from '../../../src/types/sdk/generate.js';

const BOTH = [PublishType.SourceCodePublishing, PublishType.PackagePublishing];

const VERSION = SemVersion.tryCreate('1.2.3')._unsafeUnwrap();

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
  let noSourceRepository: sinon.SinonStub;

  const configPath = () => path.join(buildDirectory, 'plugin-config.json');
  const writtenConfig = (): PluginConfigData => fsExtra.readJsonSync(configPath());

  const execute = (profile: PublishingProfile, publishTypes: PublishType[] = BOTH) =>
    action.execute(
      new DirectoryPath(buildDirectory),
      Language.CSHARP,
      profile,
      publishTypes,
      VERSION,
      CodeGenerationVersion.V3,
      true
    );

  // What `sdk publish --update-plugin-config` does: the flag already answered the question.
  const executeWithoutAsking = (profile: PublishingProfile, publishTypes: PublishType[] = BOTH) =>
    action.execute(
      new DirectoryPath(buildDirectory),
      Language.CSHARP,
      profile,
      publishTypes,
      VERSION,
      CodeGenerationVersion.V3,
      false
    );

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    buildDirectory = path.join(tmpDirResult.path, 'acme-payments', 'src');
    await fsExtra.ensureDir(buildDirectory);
    sinon.stub(PluginRecordSdkPrompts.prototype, 'sdkRecorded');
    noSourceRepository = sinon.stub(PluginRecordSdkPrompts.prototype, 'noSourceRepository');
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

    const result = await execute(profileWith(GIT_CONFIG, { packageId: 'Acme.Payments.Sdk' }));

    expect(result.isSuccess()).to.be.true;
    expect(writtenConfig()).to.deep.equal({
      languages: {
        csharp: {
          source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' },
          package: { packageId: 'Acme.Payments.Sdk', version: '1.2.3' },
          codegenVersion: 'v3'
        }
      }
    });
  });

  it('adds the language to a config that already has metadata, leaving it alone', async () => {
    await fsExtra.writeJson(configPath(), {
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
    await fsExtra.writeJson(configPath(), { languages: {} });
    const confirmRecordSdk = accepts();

    await execute(profileWith(GIT_CONFIG));

    expect(confirmRecordSdk.firstCall.args).to.deep.equal([Language.CSHARP, true]);
  });

  it('writes nothing when the user declines', async () => {
    declines();

    const result = await execute(profileWith(GIT_CONFIG));

    expect(result.isCancelled()).to.be.true;
    expect(fsExtra.existsSync(configPath())).to.be.false;
  });

  // The package half still describes a real published artifact, so the entry is worth recording;
  // the gap is called out rather than left for the user to spot in the file.
  it('says so, but still records, when there is no source repository', async () => {
    const confirmRecordSdk = accepts();

    await execute(profileWith(undefined, { packageId: 'Acme.Payments.Sdk' }));

    expect(noSourceRepository.calledOnceWith(Language.CSHARP)).to.be.true;
    expect(confirmRecordSdk.called).to.be.true;
    expect(writtenConfig().languages.csharp).to.not.have.property('source');
  });

  // The entry must describe the run, not the profile: recording either half that was not published
  // sends plugin generation at an artifact that does not exist.
  describe('records only what the run published', () => {
    it('leaves out the source when only the package was published', async () => {
      accepts();

      await execute(profileWith(GIT_CONFIG, { packageId: 'Acme.Payments.Sdk' }), [PublishType.PackagePublishing]);

      expect(writtenConfig().languages.csharp).to.deep.equal({
        package: { packageId: 'Acme.Payments.Sdk', version: '1.2.3' },
        codegenVersion: 'v3'
      });
    });

    it('leaves out the package when only the source was published', async () => {
      accepts();

      await execute(profileWith(GIT_CONFIG, { packageId: 'Acme.Payments.Sdk' }), [PublishType.SourceCodePublishing]);

      expect(writtenConfig().languages.csharp).to.not.have.property('package');
    });
  });

  // The source repository an earlier run published is still published, so a package-only run has to
  // leave it in place rather than record over it.
  it('keeps a recorded source repository when only the package was published', async () => {
    await fsExtra.writeJson(configPath(), {
      languages: {
        csharp: {
          source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' },
          codegenVersion: 'v3'
        }
      }
    });
    accepts();

    await execute(profileWith(GIT_CONFIG, { packageId: 'Acme.Payments.Sdk' }), [PublishType.PackagePublishing]);

    expect(writtenConfig().languages.csharp).to.deep.equal({
      source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' },
      package: { packageId: 'Acme.Payments.Sdk', version: '1.2.3' },
      codegenVersion: 'v3'
    });
    expect(noSourceRepository.calledOnce).to.be.true;
  });

  it('warns when the config cannot be written', async () => {
    accepts();
    sinon.stub(PluginConfigContext.prototype, 'upsertLanguage').resolves('unwritable');
    const notWritten = sinon.stub(PluginRecordSdkPrompts.prototype, 'pluginConfigNotWritten');

    const result = await execute(profileWith(GIT_CONFIG));

    expect(result.isFailed()).to.be.true;
    expect(notWritten.calledOnce).to.be.true;
  });

  it('reports a config that became unreadable after the user agreed to record', async () => {
    const confirmRecordSdk = accepts();
    sinon.stub(PluginConfigContext.prototype, 'upsertLanguage').resolves('unreadable');
    const pluginConfigUnreadable = sinon.stub(PluginRecordSdkPrompts.prototype, 'pluginConfigUnreadable');

    await execute(profileWith(GIT_CONFIG));

    expect(confirmRecordSdk.called).to.be.true;
    expect(pluginConfigUnreadable.calledOnce).to.be.true;
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
      expect(config).to.not.have.property('pluginId');
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

    const result = await execute(profileWith(GIT_CONFIG));

    expect(result.isFailed()).to.be.true;
    expect(pluginConfigUnreadable.called).to.be.true;
    expect(confirmRecordSdk.called).to.be.false;
    expect(fsExtra.readFileSync(configPath(), 'utf-8')).to.equal('{ not json');
  });
});
