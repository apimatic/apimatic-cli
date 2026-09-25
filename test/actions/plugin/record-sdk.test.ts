import * as path from 'path';
import fsExtra from 'fs-extra';
import sinon from 'sinon';
import { expect } from 'chai';
import { err } from 'neverthrow';
import { dir as tmpDir, DirectoryResult } from 'tmp-promise';
import { PluginRecordSdkAction } from '../../../src/actions/plugin/record-sdk.js';
import { PluginRecordSdkPrompts } from '../../../src/prompts/plugin/record-sdk.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { PluginConfigContext } from '../../../src/types/plugin-config-context.js';
import { PluginIdentityData, PluginLanguages } from '../../../src/types/plugin/plugin-config.js';
import { PublishType } from '../../../src/types/publish-api/publishing-profile-item.js';
import { PublishingProfile } from '../../../src/types/publish/publishing-profile.js';
import { SemVersion } from '../../../src/types/publish/version.js';
import { Language } from '../../../src/types/sdk/generate.js';

const BOTH = [PublishType.SourceCodePublishing, PublishType.PackagePublishing];

const VERSION = SemVersion.tryCreate('1.2.3')._unsafeUnwrap();

const profileWith = (gitConfiguration: object | undefined, packageConfiguration: object | undefined = undefined) =>
  ({
    getGitConfigurationForLanguage: () => gitConfiguration,
    getPackageConfigurationDataForLanguage: () => packageConfiguration
  } as unknown as PublishingProfile);

const RECORDED_SOURCE_ENTRY = {
  source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' }
};

const GIT_CONFIG = {
  isEnabled: true,
  credentialsId: 'creds',
  repositoryName: 'acme/acme-payments-csharp',
  branch: 'main'
};

/** The file as written back, read whole. */
interface WrittenDocument {
  schemaVersion?: number;
  plugin?: PluginIdentityData;
  languages: PluginLanguages;
}

describe('PluginRecordSdkAction', () => {
  let tmpDirResult: DirectoryResult;
  let sourceDirectory: string;
  let action: PluginRecordSdkAction;
  let noSourceRepository: sinon.SinonStub;

  const configPath = () => path.join(sourceDirectory, 'apimatic.json');
  const writtenConfig = (): WrittenDocument => fsExtra.readJsonSync(configPath());
  const writtenPublishing = () => writtenConfig().languages.csharp?.publishing;

  const execute = (profile: PublishingProfile, publishTypes: PublishType[] = BOTH) =>
    action.execute(new DirectoryPath(sourceDirectory), Language.CSHARP, profile, publishTypes, VERSION);

  beforeEach(async () => {
    tmpDirResult = await tmpDir({ unsafeCleanup: true });
    sourceDirectory = path.join(tmpDirResult.path, 'acme-payments', 'src');
    await fsExtra.ensureDir(sourceDirectory);
    sinon.stub(PluginRecordSdkPrompts.prototype, 'sdkRecorded');
    noSourceRepository = sinon.stub(PluginRecordSdkPrompts.prototype, 'noSourceRepository');
    action = new PluginRecordSdkAction();
  });

  afterEach(async () => {
    sinon.restore();
    await tmpDirResult.cleanup();
  });

  it('creates a config carrying the language and no plugin block at all', async () => {
    const result = await execute(profileWith(GIT_CONFIG, { packageId: 'Acme.Payments.Sdk' }));

    expect(result.isSuccess()).to.be.true;
    expect(writtenConfig()).to.deep.equal({
      schemaVersion: 1,
      languages: {
        csharp: {
          publishing: {
            source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' },
            package: { version: '1.2.3' },
            packageConfiguration: { packageId: 'Acme.Payments.Sdk' }
          }
        }
      }
    });
  });

  it('adds the language to a config that already has a plugin block, leaving it alone', async () => {
    await fsExtra.writeJson(configPath(), {
      plugin: { pluginId: 'acme-payments', pluginName: 'Acme Payments', license: 'MIT' },
      languages: {}
    });

    await execute(profileWith(GIT_CONFIG));

    const config = writtenConfig();
    expect(config.plugin).to.deep.equal({ pluginId: 'acme-payments', pluginName: 'Acme Payments', license: 'MIT' });
    expect(Object.keys(config.languages)).to.deep.equal(['csharp']);
  });

  // A publish records itself; there is nothing left for the user to answer.
  // `codegenVersion` left the schema. An entry an older CLI wrote keeps it, because the merge
  // preserves what this version does not model rather than dropping a user's file on the floor.
  it('records over an entry an older CLI wrote, leaving what it does not model', async () => {
    await fsExtra.writeJson(configPath(), {
      languages: { csharp: { publishing: { ...RECORDED_SOURCE_ENTRY, codegenVersion: 'v3' } } }
    });

    const result = await execute(profileWith(GIT_CONFIG, { packageId: 'Acme.Payments.Sdk' }));

    expect(result.isSuccess()).to.be.true;
    expect(writtenPublishing()).to.include({ codegenVersion: 'v3' });
    expect(writtenPublishing()?.packageConfiguration).to.deep.equal({ packageId: 'Acme.Payments.Sdk' });
  });

  // The package half still describes a real published artifact, so the entry is worth recording;
  // the gap is called out rather than left for the user to spot in the file.
  it('says so, but still records, when there is no source repository', async () => {
    await execute(profileWith(undefined, { packageId: 'Acme.Payments.Sdk' }));

    expect(noSourceRepository.calledOnceWith(Language.CSHARP)).to.be.true;
    expect(writtenPublishing()).to.not.have.property('source');
  });

  describe('records only what the run published', () => {
    it('leaves out the source when only the package was published', async () => {
      await execute(profileWith(GIT_CONFIG, { packageId: 'Acme.Payments.Sdk' }), [PublishType.PackagePublishing]);

      expect(writtenPublishing()).to.deep.equal({
        package: { version: '1.2.3' },
        packageConfiguration: { packageId: 'Acme.Payments.Sdk' }
      });
    });

    it('leaves out the package when only the source was published', async () => {
      await execute(profileWith(GIT_CONFIG, { packageId: 'Acme.Payments.Sdk' }), [PublishType.SourceCodePublishing]);

      expect(writtenPublishing()).to.not.have.property('package');
    });
  });

  it('keeps a recorded source repository when only the package was published', async () => {
    await fsExtra.writeJson(configPath(), {
      languages: {
        csharp: {
          publishing: {
            source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' }
          }
        }
      }
    });

    await execute(profileWith(GIT_CONFIG, { packageId: 'Acme.Payments.Sdk' }), [PublishType.PackagePublishing]);

    expect(writtenPublishing()).to.deep.equal({
      source: { repositoryUrl: 'https://github.com/acme/acme-payments-csharp', branch: 'main' },
      package: { version: '1.2.3' },
      packageConfiguration: { packageId: 'Acme.Payments.Sdk' }
    });
    expect(noSourceRepository.called).to.be.false;
  });

  it('says so when neither the run nor the config has a source repository', async () => {
    await fsExtra.writeJson(configPath(), {
      languages: {
        csharp: {
          publishing: { package: { version: '1.0.0' }, packageConfiguration: { packageId: 'Acme.Payments.Sdk' } }
        }
      }
    });

    await execute(profileWith(GIT_CONFIG, { packageId: 'Acme.Payments.Sdk' }), [PublishType.PackagePublishing]);

    expect(noSourceRepository.calledOnceWith(Language.CSHARP)).to.be.true;
  });

  it('warns when the config cannot be written', async () => {
    sinon.stub(PluginConfigContext.prototype, 'upsertLanguage').resolves(err('unwritable'));
    const notWritten = sinon.stub(PluginRecordSdkPrompts.prototype, 'pluginConfigNotWritten');

    const result = await execute(profileWith(GIT_CONFIG));

    expect(result.isFailed()).to.be.true;
    expect(notWritten.calledOnce).to.be.true;
  });

  it('reports a config that became unreadable before the write', async () => {
    sinon.stub(PluginConfigContext.prototype, 'upsertLanguage').resolves(err('unreadable'));
    const pluginConfigUnreadable = sinon.stub(PluginRecordSdkPrompts.prototype, 'pluginConfigUnreadable');

    await execute(profileWith(GIT_CONFIG));

    expect(pluginConfigUnreadable.calledOnce).to.be.true;
  });

  it('warns and records nothing when the config cannot be read', async () => {
    await fsExtra.writeFile(configPath(), '{ not json');
    const pluginConfigUnreadable = sinon.stub(PluginRecordSdkPrompts.prototype, 'pluginConfigUnreadable');

    const result = await execute(profileWith(GIT_CONFIG));

    expect(result.isFailed()).to.be.true;
    expect(pluginConfigUnreadable.called).to.be.true;
    expect(fsExtra.readFileSync(configPath(), 'utf-8')).to.equal('{ not json');
  });

  it('tells the user why the config could not be read', async () => {
    const contents = JSON.stringify({ languages: 'csharp' });
    await fsExtra.writeFile(configPath(), contents);
    const pluginConfigUnreadable = sinon.stub(PluginRecordSdkPrompts.prototype, 'pluginConfigUnreadable');

    await execute(profileWith(GIT_CONFIG));

    expect(pluginConfigUnreadable.firstCall.args[0]).to.equal(`its 'languages' is not a JSON object`);
    expect(fsExtra.readFileSync(configPath(), 'utf-8')).to.equal(contents);
  });

  // The portal block is the portal's to judge. A publish that succeeded is recorded whatever
  // state that block is in, which is the invariant the block partition exists for.
  it('records the language past a portal block the portal would refuse, leaving it as written', async () => {
    const portal = { title: '', favicon: 'x.ico' };
    await fsExtra.writeJson(configPath(), { portal, languages: {} });

    const result = await execute(profileWith(GIT_CONFIG, { packageId: 'Acme.Payments.Sdk' }));

    expect(result.isSuccess()).to.be.true;
    expect(Object.keys(writtenConfig().languages)).to.deep.equal(['csharp']);
    expect(fsExtra.readJsonSync(configPath()).portal).to.deep.equal(portal);
  });
});
