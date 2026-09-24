import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { PluginContext } from './plugin-context.js';
import { PortalArtifacts } from './portal/portal-artifacts.js';

const STATIC_DIRECTORY = 'static';
const SDK_DIRECTORY = 'sdk';
const PLUGIN_DIRECTORY = 'plugin';
const PLUGIN_ARCHIVE = 'plugin.zip';

/** Where a run's artifacts ended up, so a caller can name them without deriving a path. */
export interface PlacedArtifacts {
  plugin: DirectoryPath | undefined;
}

/**
 * Where the artifacts of a run go once they are downloaded. Two homes, because they answer two
 * questions:
 *
 * - under the portal's `static/`, so the built site can offer the SDKs and the plugin as downloads
 * - expanded beside `src/`, which is the directory the installer takes and `plugin publish` reads
 *
 * Both are inside the project, so a preview shows the same downloads a published portal will.
 */
export class PortalArtifactsContext {
  private readonly fileService = new FileService();

  constructor(private readonly sourceDirectory: DirectoryPath) {}

  private get sdkDirectory(): DirectoryPath {
    return this.sourceDirectory.join(STATIC_DIRECTORY, SDK_DIRECTORY);
  }

  private get pluginArchive(): FilePath {
    return new FilePath(this.sourceDirectory.join(STATIC_DIRECTORY), new FileName(PLUGIN_ARCHIVE));
  }

  private get pluginDirectory(): DirectoryPath {
    return this.sourceDirectory.resolve('..').join(PLUGIN_DIRECTORY);
  }

  public async place(artifacts: PortalArtifacts): Promise<PlacedArtifacts> {
    await this.placeSdks(artifacts.sdks);

    return { plugin: await this.placePlugin(artifacts.plugin) };
  }

  /**
   * The directory is replaced rather than added to. A language dropped from `apimatic.json`
   * between runs would otherwise leave its SDK on the download page, offering something the
   * portal no longer documents — and the directory is named and filled by this CLI, so nothing
   * else is in it. A run carrying no SDKs takes it away entirely, so a portal that documents no
   * language does not grow an empty download directory.
   */
  private async placeSdks(sdks: ReadonlyMap<string, FilePath>): Promise<void> {
    if (sdks.size === 0) {
      await this.fileService.deleteDirectory(this.sdkDirectory);
      return;
    }

    await this.fileService.createDirectoryIfNotExists(this.sdkDirectory);
    await this.fileService.cleanDirectory(this.sdkDirectory);

    for (const [language, archive] of sdks) {
      await this.fileService.copy(archive, new FilePath(this.sdkDirectory, new FileName(`${language}.zip`)));
    }
  }

  /**
   * `PluginContext.save` does the expanding, which is what keeps a repository the user has already
   * pushed from: `plugin publish` turns this directory into its own git repository, and replacing
   * it outright would take the history with it.
   */
  private async placePlugin(archive: FilePath | undefined): Promise<DirectoryPath | undefined> {
    if (!archive) {
      return undefined;
    }

    await this.fileService.createDirectoryIfNotExists(this.sourceDirectory.join(STATIC_DIRECTORY));
    await this.fileService.copy(archive, this.pluginArchive);

    const plugin = this.pluginDirectory;
    await this.fileService.createDirectoryIfNotExists(plugin);
    await new PluginContext(plugin).save(archive);

    return plugin;
  }
}
