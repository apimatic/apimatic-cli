import { ExportFormats } from '@apimatic/sdk';
import { FileService } from '../infrastructure/file-service.js';
import { getFileNameFromPath } from '../utils/utils.js';
import { DestinationFormats } from './api/transform.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';

/** Where `api transform` writes, inside the `--destination` it is given. */
export const TRANSFORMATIONS_DIRECTORY_NAME = 'transformations';

export class TransformContext {
  private readonly fileService = new FileService();

  private readonly transformedApi: FileName;

  constructor(specFilePath: FilePath, format: ExportFormats, private readonly destinationDirectory: DirectoryPath) {
    this.transformedApi = this.parseFileName(format, specFilePath);
  }

  public transformedFile(): FilePath {
    return new FilePath(this.destinationDirectory, this.transformedApi);
  }

  public async exists(): Promise<boolean> {
    return await this.fileService.fileExists(this.transformedFile());
  }

  public async save(stream: NodeJS.ReadableStream): Promise<FilePath> {
    await this.fileService.createDirectoryIfNotExists(this.destinationDirectory);
    await this.fileService.writeFile(this.transformedFile(), stream);
    return this.transformedFile();
  }

  private parseFileName(format: string, file: FilePath): FileName {
    const destinationFileExt: string = DestinationFormats[format as keyof typeof DestinationFormats];
    const destinationFilePrefix = getFileNameFromPath(file.toString());
    return new FileName(`${destinationFilePrefix}_${format}.${destinationFileExt}`);
  }
}
