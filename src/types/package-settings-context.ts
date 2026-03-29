import { FileService } from '../infrastructure/file-service.js';
import { toPackageConfiguration } from './publish-api/package-configuration.js';
import { BaseConfigurationItem } from './publish-api/publishing-profile.js';
import { Language } from './sdk/generate.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileName } from './file/fileName.js';

export class PackageSettingsContext {
  private readonly fileService = new FileService();

  constructor(private readonly packageSettingsDirectory: DirectoryPath) {}

  private getSettingsFilePath(language: Language): FilePath {
    return new FilePath(this.packageSettingsDirectory, new FileName(`${language}.json`));
  }

  public async writeConfiguration(configuration: BaseConfigurationItem, language: Language) {
    const packageSettingsFilePath = this.getSettingsFilePath(language);
    if (await this.fileService.fileExists(packageSettingsFilePath)) return;
    await this.fileService.createDirectoryIfNotExists(this.packageSettingsDirectory);
    await this.fileService.writeContents(
      packageSettingsFilePath,
      JSON.stringify({ packageConfiguration: toPackageConfiguration(language, configuration) }, null, 2)
    );
  }
}
